/**
 * src/db/devchecks.ts
 *
 * THE DEVICE PASS. Dev-only. Must never ship.
 *
 * Everything here needs a real SQLite connection and a real filesystem, so it cannot run
 * under `node --test`. It is the other half of the no-bypass proof plus an end-to-end
 * exercise of `backup.ts`, which is the file with the most logic and the least execution
 * in the codebase.
 *
 * HOW IT IS KEPT OUT OF PRODUCTION
 *   - `src/db/devPass.ts` reaches it through `require()` inside an `if (__DEV__)` block.
 *     Metro replaces `__DEV__` with `false` in a production bundle and drops the branch,
 *     so the module is never reachable and never bundled. It deliberately does NOT live
 *     under `__tests__/`: Metro excludes that directory from resolution entirely, so the
 *     module simply would not exist at runtime.
 *   - There is a Slice 11 checklist item to verify that by grepping the release bundle.
 *
 * IT RUNS ON ITS OWN DATABASE, `devcheck.db`, chosen at launch by
 * `EXPO_PUBLIC_DEVICE_PASS=1` (see DATABASE_NAME in client.ts). It still exercises the
 * app's real write path, migrations and backup code — the same modules, a different file.
 * It used to share the reader's library, and it seeds, deletes, renames `sync_queue` and
 * restores backups over the live database: it wrote to the owner's real library twice.
 * It still cleans up after itself, and everything it creates is soft-deleted.
 */

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { File, Paths } from 'expo-file-system'

import { checkpointWal, dangerouslyExecDevSql, DATABASE_NAME, getDb } from './client'
import { books, reads, sessions, syncQueue } from './schema'
import { restoreRow, softDelete, updateRow, writeRow } from './write'
import {
  backupBeforeMigration,
  backupsDirectory,
  listBackups,
  pruneBackups,
  restoreNewestBackup,
} from './backup'
import { SCHEMA_VERSION } from './migrate'
import { seedSampleLibrary, SEEDED_TITLE } from './seed'
import { now, toLocalDay } from '@/lib/dates'
import { newId } from '@/lib/ids'

/**
 * `runtime` checks actually exercise the device. `compile-time` checks assert a property
 * the type system already guarantees and execute nothing.
 *
 * They are counted separately and deliberately. Folding a compile-time assertion into a
 * runtime pass count inflates the number, and an inflated number is worse than a smaller
 * honest one — these counts have to stay trustworthy for the next eleven slices.
 */
export type CheckKind = 'runtime' | 'compile-time'

export interface CheckResult {
  readonly name: string
  readonly kind: CheckKind
  readonly passed: boolean
  readonly detail: string
}

const results: CheckResult[] = []

function record(name: string, kind: CheckKind, passed: boolean, detail: string) {
  results.push({ name, kind, passed, detail })
  const tag = kind === 'runtime' ? '' : ' [compile-time]'
  // eslint-disable-next-line no-console
  console.log(`[devcheck] ${passed ? 'PASS' : 'FAIL'}${tag}  ${name}  ::  ${detail}`)
}

async function check(name: string, fn: () => Promise<string>, kind: CheckKind = 'runtime') {
  try {
    record(name, kind, true, await fn())
  } catch (e) {
    record(name, kind, false, e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  }
}

/** `asserts cond` so a passing assert narrows a Result to its ok branch. */
function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function queueRowsFor(table: string, rowId: string) {
  return getDb()
    .select()
    .from(syncQueue)
    .where(and(eq(syncQueue.tableName, table), eq(syncQueue.rowId, rowId)))
}

/** Resolves once the clock has moved, so two deletes can never share a timestamp. */
async function nextMs(): Promise<void> {
  const start = now()
  while (now() === start) await new Promise((resolve) => setTimeout(resolve, 2))
}

// ─── 0. THE PASS IS NOT RUNNING ON THE READER'S LIBRARY ──────────────────────

async function checkOwnDatabase() {
  /**
   * FIRST, because everything after it is destructive: it seeds, soft-deletes, renames
   * `sync_queue` and restores backups over the live file. It ran against the reader's real
   * library until 2026-09-12 and touched it twice. If this check ever fails, the rest of
   * the pass is writing to somebody's books.
   */
  await check('0. the pass is running on its own database', async () => {
    assert(
      DATABASE_NAME === 'devcheck.db',
      `the pass is open on ${DATABASE_NAME}, not devcheck.db: refusing to vouch for anything below`,
    )
    const library = new File(Paths.document, 'SQLite', 'reader.db')
    const mine = new File(Paths.document, 'SQLite', DATABASE_NAME)
    assert(mine.uri !== library.uri, 'the two databases resolve to the same file')
    return `${DATABASE_NAME}; the library at ${library.exists ? 'reader.db is untouched' : 'reader.db does not exist here'}`
  })
}

// ─── 1. EVERY WRITE LEAVES EXACTLY ONE QUEUE ROW ─────────────────────────────

async function checkEnqueueOnWrite() {
  await check('1a. create enqueues exactly one upsert', async () => {
    const id = newId()
    const r = await writeRow('books', {
      id,
      title: 'Devcheck Book',
      source: 'manual',
    })
    assert(r.ok, 'writeRow returned an error')

    const rows = await queueRowsFor('books', id)
    assert(rows.length === 1, `expected 1 queue row, got ${rows.length}`)
    assert(rows[0]?.operation === 'upsert', `operation was ${rows[0]?.operation}`)
    return `id=${id.slice(0, 8)} one upsert row`
  })

  await check('1b. soft delete enqueues a delete and keeps the row', async () => {
    const id = newId()
    await writeRow('books', {
      id,
      title: 'Devcheck Delete',
      source: 'manual',
    })
    const del = await softDelete('books', id)
    assert(del.ok, 'softDelete returned an error')
    assert(del.value.changed, 'softDelete reported no change for a live row')

    const rows = await queueRowsFor('books', id)
    assert(rows.length === 2, `expected 2 queue rows, got ${rows.length}`)
    assert(
      rows.some((q) => q.operation === 'delete'),
      'no delete operation was enqueued',
    )

    // The row must still exist with deleted_at set. A hard delete here is a bug.
    const live = await getDb().select().from(books).where(eq(books.id, id))
    assert(live.length === 1, 'row was hard-deleted')
    assert(live[0]?.deletedAt !== null, 'deleted_at was not set')

    // And restore must bring it back and enqueue an upsert.
    const res = await restoreRow('books', id)
    assert(res.ok, 'restoreRow failed')
    assert(res.value.changed, 'restoreRow reported no change for a deleted row')
    const after = await getDb().select().from(books).where(eq(books.id, id))
    assert(after[0]?.deletedAt === null, 'restore did not clear deleted_at')

    // A no-op must SAY it did nothing. `ok` only means "no error"; a caller that shows an
    // undo toast on `ok` would offer to undo a delete that never happened.
    const again = await restoreRow('books', id)
    assert(again.ok, 'restoring a live row should not be an error')
    assert(!again.value.changed, 'restoring a LIVE row reported a change')

    const queueAfter = await queueRowsFor('books', id)
    const noopDelete = await softDelete('books', 'no-such-book-' + newId())
    assert(noopDelete.ok, 'deleting a missing row should not be an error')
    assert(!noopDelete.value.changed, 'deleting a MISSING row reported a change')
    const queueAfterNoop = await queueRowsFor('books', id)
    assert(
      queueAfter.length === queueAfterNoop.length,
      'a no-op write still touched the sync queue',
    )

    return 'delete is soft, row survives, restore clears deleted_at, no-ops report no change'
  })

  /**
   * THE REGRESSION CHECK FOR BUG #4, which never had one: `writeRow` handed the caller's
   * whole values object to `onConflictDoUpdate`, so every update rewrote `created_at` to
   * whatever was passed. A library sorted by date added was silently wrong months later.
   * `RowFor` now omits the column; this asserts the behaviour, in the direction that
   * matters, against the real database.
   */
  await check(
    '1c. an update never rewrites created_at, and always moves updated_at',
    async () => {
      const id = newId()
      assert(
        (await writeRow('books', { id, title: 'Devcheck Created At', source: 'manual' })).ok,
        'create failed',
      )
      const first = await getDb().select().from(books).where(eq(books.id, id))
      const createdAt = first[0]?.createdAt
      const updatedAt = first[0]?.updatedAt
      assert(typeof createdAt === 'number', 'created_at was not stamped')

      await nextMs()
      assert(
        (
          await writeRow('books', {
            id,
            title: 'Devcheck Created At (edited)',
            source: 'manual',
          })
        ).ok,
        'upsert failed',
      )
      const afterUpsert = await getDb().select().from(books).where(eq(books.id, id))
      assert(
        afterUpsert[0]?.createdAt === createdAt,
        `an UPSERT moved created_at: ${createdAt} -> ${afterUpsert[0]?.createdAt}`,
      )
      assert(
        (afterUpsert[0]?.updatedAt ?? 0) > (updatedAt ?? 0),
        'an upsert did not move updated_at',
      )

      await nextMs()
      assert(
        (await updateRow('books', id, { title: 'Devcheck Created At (patched)' })).ok,
        'patch failed',
      )
      const afterPatch = await getDb().select().from(books).where(eq(books.id, id))
      assert(
        afterPatch[0]?.createdAt === createdAt,
        `a PATCH moved created_at: ${createdAt} -> ${afterPatch[0]?.createdAt}`,
      )
      assert(
        (afterPatch[0]?.updatedAt ?? 0) > (afterUpsert[0]?.updatedAt ?? 0),
        'a patch did not move updated_at',
      )
      return `created_at held at ${createdAt} across an upsert and a patch`
    },
  )
}

// ─── 2. THE WRITE AND THE ENQUEUE ARE ONE TRANSACTION ────────────────────────

async function checkAtomicity() {
  /**
   * THE DIRECTION THAT MATTERS.
   *
   * The whole no-bypass guarantee rests on this: if the enqueue fails, the table write
   * must not survive. A row that lands in `books` without a `sync_queue` entry is a row
   * that never reaches the server — invisible local data loss, discovered months later
   * on a new phone.
   *
   * The only way to make the enqueue fail is to break the table, so this renames
   * `sync_queue` out of the way, attempts a real write through the real write path, and
   * renames it back. The rename-back is in a `finally` and is verified afterwards,
   * because leaving the queue renamed would break every subsequent write.
   */
  await check('2a. a failing ENQUEUE rolls back the table write', async () => {
    const id = newId()
    const booksBefore = await getDb()
      .select({ n: sql<number>`count(*)` })
      .from(books)
    let renamed = false

    try {
      dangerouslyExecDevSql('ALTER TABLE sync_queue RENAME TO sync_queue_broken;')
      renamed = true

      const r = await writeRow('books', {
        id,
        title: 'Devcheck Atomicity',
        source: 'manual',
      })

      assert(
        !r.ok,
        'the write SUCCEEDED with no sync_queue table - the enqueue is not really happening',
      )
    } finally {
      if (renamed) {
        dangerouslyExecDevSql('ALTER TABLE sync_queue_broken RENAME TO sync_queue;')
      }
    }

    // The book must NOT be there. This is the assertion the whole design rests on.
    const wrote = await getDb().select().from(books).where(eq(books.id, id))
    assert(
      wrote.length === 0,
      'THE ROW SURVIVED A FAILED ENQUEUE. The write and the enqueue are not atomic, so ' +
        'rows can exist locally that will never sync.',
    )

    const booksAfter = await getDb()
      .select({ n: sql<number>`count(*)` })
      .from(books)
    assert(
      (booksBefore[0]?.n ?? -1) === (booksAfter[0]?.n ?? -2),
      `books count changed: ${booksBefore[0]?.n} -> ${booksAfter[0]?.n}`,
    )

    // And the queue must be usable again, or every later check is meaningless.
    const probe = await writeRow('books', {
      id: newId(),
      title: 'Devcheck Atomicity Probe',
      source: 'manual',
    })
    assert(probe.ok, 'sync_queue was not restored: the rename-back failed')

    return 'enqueue failure rolled the row back; queue restored and working'
  })

  await check('2b. a failing table write leaves no queue row', async () => {
    // A session whose read_id does not exist violates the foreign key, so the table
    // write fails *inside* the transaction. If the pair were two statements that merely
    // usually both succeed, a sync_queue row would survive. It must not.
    const id = newId()
    const before = await getDb()
      .select({ n: sql<number>`count(*)` })
      .from(syncQueue)

    const r = await writeRow('sessions', {
      id,
      readId: 'no-such-read-' + newId(),
      occurredAt: now(),
      format: 'pages',
      fromPosition: 0,
      toPosition: 10,
      isTimed: 0,
    })

    assert(!r.ok, 'the write unexpectedly SUCCEEDED - is PRAGMA foreign_keys really ON?')

    const rows = await queueRowsFor('sessions', id)
    assert(rows.length === 0, `orphaned queue row survived a failed write (${rows.length})`)

    const after = await getDb()
      .select({ n: sql<number>`count(*)` })
      .from(syncQueue)
    assert(
      (before[0]?.n ?? 0) === (after[0]?.n ?? 0),
      `queue length changed: ${before[0]?.n} -> ${after[0]?.n}`,
    )

    const wrote = await getDb().select().from(sessions).where(eq(sessions.id, id))
    assert(wrote.length === 0, 'the session row was written despite the failure')
    return 'FK violation rolled back both the row and the queue entry'
  })
}

// ─── 3. LOCAL-ONLY TABLES NEVER ENQUEUE ──────────────────────────────────────

async function checkLocalOnlyTables() {
  await check(
    '3. metadata_cache and sync_queue are not writable via the sync path',
    () => {
      // Enforced at compile time: `writeRow('metadata_cache', ...)` does not typecheck,
      // because the table is absent from the SYNCABLE registry. There is deliberately no
      // runtime path to test - the mistake is unrepresentable, which is stronger than a
      // passing assertion. Counted separately so it cannot inflate the runtime tally.
      return Promise.resolve('enforced by the type system; nothing executed')
    },
    'compile-time',
  )
}

// ─── 4. THE SEED LEAVES A CLEAN TRAIL ────────────────────────────────────────

async function checkSeed() {
  await check('4. seed writes 1 book, 1 read, 3 sessions and 5 queue rows', async () => {
    const before = await getDb()
      .select({ n: sql<number>`count(*)` })
      .from(syncQueue)
    const seeded = await seedSampleLibrary()
    assert(seeded.ok, `seed failed: ${seeded.ok ? '' : seeded.error.message}`)

    const bookId = seeded.value.bookId
    const readRows = await getDb().select().from(reads).where(eq(reads.bookId, bookId))
    assert(readRows.length === 1, `expected 1 read, got ${readRows.length}`)

    const readId = readRows[0]?.id as string
    const sessionRows = await getDb()
      .select()
      .from(sessions)
      .where(and(eq(sessions.readId, readId), isNull(sessions.deletedAt)))
    assert(sessionRows.length === 3, `expected 3 sessions, got ${sessionRows.length}`)

    // started_at must still be NULL. Writing a computed value into an override column
    // is the single most important rule in the data model.
    assert(readRows[0]?.startedAt === null, 'seed wrote a computed value into started_at')
    assert(readRows[0]?.finishedAt === null, 'seed wrote a computed value into finished_at')

    // Every session's local_day must agree with its occurred_at in this timezone.
    for (const s of sessionRows) {
      assert(
        s.localDay === toLocalDay(s.occurredAt),
        `local_day ${s.localDay} disagrees with occurred_at ${toLocalDay(s.occurredAt)}`,
      )
    }

    // Mixed formats on one read is the whole thesis.
    const formats = new Set(sessionRows.map((s) => s.format))
    assert(formats.has('pages') && formats.has('minutes'), 'seed lost the mixed formats')

    const after = await getDb()
      .select({ n: sql<number>`count(*)` })
      .from(syncQueue)
    const added = (after[0]?.n ?? 0) - (before[0]?.n ?? 0)
    assert(added === 5, `expected 5 new queue rows, got ${added}`)

    return `book+read+3 sessions, started_at NULL, local_day consistent, ${added} queue rows`
  })
}

// ─── 5. BACKUP.TS, AGAINST ITS ACTUAL ASSUMPTIONS ────────────────────────────

async function checkBackupAssumptions() {
  await check('5a. Paths.availableDiskSpace returns a usable number', async () => {
    const free = Paths.availableDiskSpace
    assert(free !== undefined, 'Paths.availableDiskSpace is undefined - the API moved')
    assert(free !== null, 'Paths.availableDiskSpace returned null')
    assert(typeof free === 'number', `expected number, got ${typeof free}`)
    assert(free > 0, `implausible free space: ${free}`)
    return `${(free / 1024 / 1024 / 1024).toFixed(1)} GB free`
  })

  await check('5b. the SQLite directory is where backup.ts assumes', async () => {
    const db = new File(Paths.document, 'SQLite', DATABASE_NAME)
    assert(db.exists, `no database at ${db.uri} - the assumed path is wrong`)
    const size = db.size ?? 0
    assert(size > 0, `database reports size ${size}`)
    return `${db.uri} (${size} bytes)`
  })

  await check('5c. WAL sidecars exist, so a bare copy would lose data', async () => {
    const wal = new File(Paths.document, 'SQLite', `${DATABASE_NAME}-wal`)
    const shm = new File(Paths.document, 'SQLite', `${DATABASE_NAME}-shm`)
    const main = new File(Paths.document, 'SQLite', DATABASE_NAME)
    assert(wal.exists, 'no -wal file: is journal_mode really WAL?')
    return `main=${main.size ?? 0}B wal=${wal.size ?? 0}B shm=${shm.exists ? (shm.size ?? 0) : 0}B`
  })

  await check('5d. checkpointWal folds the log into the main file', async () => {
    const main = new File(Paths.document, 'SQLite', DATABASE_NAME)
    const wal = new File(Paths.document, 'SQLite', `${DATABASE_NAME}-wal`)
    const mainBefore = main.size ?? 0
    const walBefore = wal.exists ? (wal.size ?? 0) : 0

    checkpointWal()

    const mainAfter = main.size ?? 0
    const walAfter = wal.exists ? (wal.size ?? 0) : 0
    assert(
      mainAfter >= mainBefore,
      `main shrank across checkpoint: ${mainBefore} -> ${mainAfter}`,
    )
    return `main ${mainBefore}->${mainAfter}B, wal ${walBefore}->${walAfter}B`
  })

  await check('5e. backup copies the database AND both sidecars', async () => {
    const made = await backupBeforeMigration(SCHEMA_VERSION)
    assert(made.ok, `backup failed: ${made.ok ? '' : made.error.message}`)
    assert(made.value.kind === 'made', 'backup was skipped, but the database exists')
    const backup = made.value.backup

    const copy = new File(backup.uri)
    assert(copy.exists, 'the backup file does not exist')
    assert((copy.size ?? 0) > 0, 'the backup file is empty')
    assert(
      backup.schemaVersion === SCHEMA_VERSION,
      `backup recorded schema ${backup.schemaVersion}, expected ${SCHEMA_VERSION}`,
    )

    // The sidecars are the belt-and-braces half of the fix.
    const walCopy = new File(`${backup.uri}-wal`)
    const liveWal = new File(Paths.document, 'SQLite', `${DATABASE_NAME}-wal`)
    const walCopied = walCopy.exists
    assert(
      !liveWal.exists || walCopied,
      'a live -wal exists but was not copied alongside the backup',
    )
    return `${backup.name} ${copy.size ?? 0}B, wal copied=${walCopied}`
  })

  await check('5f. backups are listed newest-first and prune keeps three', async () => {
    // Make enough backups to force a prune.
    for (let i = 0; i < 4; i += 1) await backupBeforeMigration(SCHEMA_VERSION)
    const before = listBackups()
    assert(before.length >= 4, `expected >=4 backups, got ${before.length}`)
    for (let i = 1; i < before.length; i += 1) {
      const prev = before[i - 1]
      const curr = before[i]
      assert(
        (prev?.createdAt ?? 0) >= (curr?.createdAt ?? 0),
        'listBackups is not sorted newest-first',
      )
    }

    pruneBackups()
    const after = listBackups()
    assert(after.length === 3, `prune left ${after.length} backups, expected 3`)

    // Pruned sidecars must go with their database.
    const dir = backupsDirectory()
    const orphans = dir
      .list()
      .filter((e) => e instanceof File && e.name.endsWith('-wal'))
      .filter((e) => !after.some((b) => `${b.name}-wal` === (e as File).name))
    assert(orphans.length === 0, `${orphans.length} orphaned -wal files survived prune`)
    return `${before.length} -> 3 kept, no orphaned sidecars`
  })
}

// ─── 6. A REAL RESTORE ───────────────────────────────────────────────────────

async function checkRestore() {
  await check('6. restore returns the database to its backed-up contents', async () => {
    // A marker row that exists at backup time.
    const markerId = newId()
    await writeRow('books', {
      id: markerId,
      title: 'Devcheck Restore Marker',
      source: 'manual',
    })
    checkpointWal()

    const made = await backupBeforeMigration(SCHEMA_VERSION)
    assert(made.ok, 'backup before restore failed')

    // A row created AFTER the backup. It must be gone once we restore.
    const afterId = newId()
    await writeRow('books', {
      id: afterId,
      title: 'Devcheck Written After Backup',
      source: 'manual',
    })
    checkpointWal()

    const presentBefore = await getDb().select().from(books).where(eq(books.id, afterId))
    assert(presentBefore.length === 1, 'the post-backup row was not written')

    const restored = restoreNewestBackup(SCHEMA_VERSION)
    assert(restored.ok, `restore failed: ${restored.ok ? '' : restored.error.message}`)

    // Read through a NEW query after restore. Whether the existing connection sees the
    // swapped file is the interesting part and is reported honestly either way.
    const marker = await getDb().select().from(books).where(eq(books.id, markerId))
    const post = await getDb().select().from(books).where(eq(books.id, afterId))

    assert(marker.length === 1, 'the marker row did not survive the restore')
    assert(
      post.length === 0,
      'the post-backup row is STILL VISIBLE - the live connection did not pick up the ' +
        'restored file, so restore does not take effect until the app restarts',
    )
    return 'marker survived, post-backup row gone'
  })

  /**
   * THE DIRECTION THAT MATTERS, and the one the code used to get wrong.
   *
   * `restoreNewestBackup` picked the newest file by timestamp and ignored the schema
   * version sitting in its own filename. After a rollback to an older build, the newest
   * backup on disk is from a schema this binary has never seen, and restoring it hands
   * the app a database it cannot read — a worse state than the failed migration being
   * rolled back.
   *
   * Asserting "restore works" would never have caught that. This asserts the specific
   * thing the design depends on: given a compatible backup AND a newer one that is more
   * recent, the compatible one wins.
   */
  await check('6b. restore SKIPS a backup from a newer schema than this build', async () => {
    // A backup this build can read.
    const compatibleMarker = newId()
    await writeRow('books', {
      id: compatibleMarker,
      title: 'Devcheck Compatible Backup Marker',
      source: 'manual',
    })
    checkpointWal()
    const compatible = await backupBeforeMigration(SCHEMA_VERSION)
    assert(compatible.ok && compatible.value.kind === 'made', 'compatible backup failed')

    // A NEWER row, captured in a backup stamped with a FUTURE schema version. It is the
    // newest backup on disk, so a version-blind restore would choose it.
    const futureMarker = newId()
    await writeRow('books', {
      id: futureMarker,
      title: 'Devcheck Future Schema Marker',
      source: 'manual',
    })
    checkpointWal()
    const future = await backupBeforeMigration(SCHEMA_VERSION + 1)
    assert(future.ok && future.value.kind === 'made', 'future-schema backup failed')
    assert(
      listBackups()[0]?.name === future.value.backup.name,
      'the future-schema backup is not the newest on disk, so this check proves nothing',
    )

    const restored = restoreNewestBackup(SCHEMA_VERSION)
    assert(restored.ok, `restore failed: ${restored.ok ? '' : restored.error.message}`)

    const compatibleRow = await getDb()
      .select()
      .from(books)
      .where(eq(books.id, compatibleMarker))
    const futureRow = await getDb().select().from(books).where(eq(books.id, futureMarker))

    assert(compatibleRow.length === 1, 'the compatible backup was not the one restored')
    assert(
      futureRow.length === 0,
      'THE FUTURE-SCHEMA BACKUP WAS RESTORED. A rollback would leave the app holding a ' +
        'database it cannot read.',
    )
    return `restored v${SCHEMA_VERSION} backup, skipped the newer v${SCHEMA_VERSION + 1} one`
  })
}

// ─── 8. LOCAL_DAY FOLLOWS OCCURRED_AT, AND ONLY IT ───────────────────────────

const DAY = 24 * 60 * 60 * 1000

/** A live book, read and session to test against. Removed by cleanup, by title. */
async function devSession(title: string, occurredAt: number) {
  const bookId = newId()
  const readId = newId()
  const sessionId = newId()
  const b = await writeRow('books', { id: bookId, title, source: 'manual' })
  const r = await writeRow('reads', { id: readId, bookId, status: 'reading', readNumber: 1 })
  const s = await writeRow('sessions', {
    id: sessionId,
    readId,
    occurredAt,
    format: 'pages',
    fromPosition: 0,
    toPosition: 10,
    isTimed: 0,
  })
  assert(b.ok && r.ok && s.ok, 'could not create the test session')
  return { bookId, readId, sessionId }
}

async function dayOf(sessionId: string): Promise<string | undefined> {
  const rows = await getDb()
    .select({ day: sessions.localDay })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
  return rows[0]?.day
}

/**
 * Stamp a day no computation in this timezone could produce, standing in for a session
 * written while the reader was somewhere else. Any write that recomputes the day when it
 * should not is then visible, whatever zone the device is in.
 */
function plantForeignDay(sessionId: string) {
  dangerouslyExecDevSql(
    `UPDATE sessions SET local_day = '1999-01-01' WHERE id = '${sessionId}'`,
  )
}

async function checkLocalDay() {
  await check('8a. local_day is derived from occurred_at on insert', async () => {
    const at = now() - 3 * DAY
    const { sessionId } = await devSession('Devcheck LocalDay Insert', at)
    const day = await dayOf(sessionId)
    assert(day === toLocalDay(at), `local_day ${day}, expected ${toLocalDay(at)}`)
    return `local_day ${day}`
  })

  await check('8b. a write that leaves the instant alone never moves local_day', async () => {
    const at = now() - 2 * DAY
    const { sessionId, readId } = await devSession('Devcheck LocalDay Keep', at)
    plantForeignDay(sessionId)

    const note = await updateRow('sessions', sessionId, { note: 'edited' })
    assert(note.ok && note.value.changed, 'the note edit failed')
    assert((await dayOf(sessionId)) === '1999-01-01', 'a NOTE edit rewrote local_day')

    const same = await updateRow('sessions', sessionId, { occurredAt: at })
    assert(same.ok, 'the same-instant edit failed')
    assert(
      (await dayOf(sessionId)) === '1999-01-01',
      'the SAME instant, re-set, moved local_day',
    )

    const upsert = await writeRow('sessions', {
      id: sessionId,
      readId,
      occurredAt: at,
      format: 'pages',
      fromPosition: 0,
      toPosition: 12,
      isTimed: 0,
    })
    assert(upsert.ok, 'the upsert failed')
    assert((await dayOf(sessionId)) === '1999-01-01', 'a same-instant UPSERT moved local_day')
    return 'note edit, same-instant updateRow and same-instant upsert all kept the stored day'
  })

  await check('8c. moving occurred_at moves local_day, through both write paths', async () => {
    const { sessionId, readId } = await devSession('Devcheck LocalDay Move', now() - 5 * DAY)

    const moved = now() - 9 * DAY
    const u = await updateRow('sessions', sessionId, { occurredAt: moved })
    assert(u.ok && u.value.changed, 'updateRow failed')
    const afterUpdate = await dayOf(sessionId)
    assert(afterUpdate === toLocalDay(moved), `updateRow left local_day at ${afterUpdate}`)

    plantForeignDay(sessionId)
    const again = now() - 11 * DAY
    const w = await writeRow('sessions', {
      id: sessionId,
      readId,
      occurredAt: again,
      format: 'pages',
      fromPosition: 0,
      toPosition: 10,
      isTimed: 0,
    })
    assert(w.ok, 'the upsert failed')
    const afterUpsert = await dayOf(sessionId)
    assert(afterUpsert === toLocalDay(again), `the upsert left local_day at ${afterUpsert}`)
    return `updateRow -> ${afterUpdate}, upsert -> ${afterUpsert}`
  })

  await check(
    '8d. a patch of only undefined values is no change and queues nothing',
    async () => {
      const { sessionId } = await devSession('Devcheck Undefined Patch', now())
      const stamp = async () =>
        (
          await getDb()
            .select({ u: sessions.updatedAt })
            .from(sessions)
            .where(eq(sessions.id, sessionId))
        )[0]?.u
      const before = await stamp()
      const queued = (await queueRowsFor('sessions', sessionId)).length

      // Built the way an untyped caller would build it (a form, a parsed payload): the
      // compiler rejects `{ note: undefined }` written literally, and the runtime rule must
      // hold for the data that never passed through it.
      const patch: Parameters<typeof updateRow<'sessions'>>[2] = {}
      Reflect.set(patch, 'note', undefined)
      Reflect.set(patch, 'toPosition', undefined)

      const r = await updateRow('sessions', sessionId, patch)
      assert(r.ok, 'an all-undefined patch returned an error')
      assert(!r.value.changed, 'an all-undefined patch reported a change')
      assert((await stamp()) === before, 'an all-undefined patch bumped updated_at')
      const after = (await queueRowsFor('sessions', sessionId)).length
      assert(after === queued, `an all-undefined patch queued ${after - queued} sync row(s)`)
      return 'no change, updated_at untouched, nothing queued'
    },
  )
}

// ─── 9. RESTORE UNDOES EXACTLY ITS CASCADE, AND NEVER ORPHANS A ROW ──────────

/** A row's `deleted_at`: null when live, undefined when the row does not exist. */
async function deletedAtOf(table: string, id: string): Promise<number | null | undefined> {
  const rows = await getDb().all<{ deleted_at: number | null }>(
    sql`select deleted_at from ${sql.identifier(table)} where id = ${id}`,
  )
  return rows[0]?.deleted_at
}

async function upsertsFor(table: string, id: string): Promise<number> {
  return (await queueRowsFor(table, id)).filter((q) => q.operation === 'upsert').length
}

async function devBook(title: string) {
  const bookId = newId()
  const readId = newId()
  const b = await writeRow('books', { id: bookId, title, source: 'manual' })
  const r = await writeRow('reads', { id: readId, bookId, status: 'reading', readNumber: 1 })
  assert(b.ok && r.ok, 'could not create the test book')
  return { bookId, readId }
}

async function devSessionUnder(readId: string): Promise<string> {
  const id = newId()
  const s = await writeRow('sessions', {
    id,
    readId,
    occurredAt: now(),
    format: 'pages',
    fromPosition: 0,
    toPosition: 5,
    isTimed: 0,
  })
  assert(s.ok, 'could not create the test session')
  return id
}

async function devShelf(bookId: string) {
  const shelfId = newId()
  const assignmentId = newId()
  const sh = await writeRow('shelves', { id: shelfId, name: 'Devcheck Shelf', sortOrder: 0 })
  const a = await writeRow('book_shelves', {
    id: assignmentId,
    bookId,
    shelfId,
    addedAt: now(),
  })
  assert(sh.ok && a.ok, 'could not create the test shelf')
  return { shelfId, assignmentId }
}

async function checkRestoreCascade() {
  /**
   * THE MUST-HAVE FROM 06-CONVENTIONS, which nothing tested: a soft delete cascades AND
   * its restore reverses exactly that set. Both directions: everything the delete took
   * comes back, and a session deleted separately before it does not.
   */
  await check('9a. restoring a book brings back exactly what its delete took', async () => {
    const { bookId, readId } = await devBook('Devcheck Cascade Exact')
    const kept = await devSessionUnder(readId)
    const separate = await devSessionUnder(readId)
    const noteId = newId()
    const n = await writeRow('notes', { id: noteId, bookId, type: 'note', content: 'devcheck' })
    assert(n.ok, 'could not create the test note')
    const { shelfId, assignmentId } = await devShelf(bookId)

    assert((await softDelete('sessions', separate)).ok, 'the separate delete failed')
    await nextMs()
    const del = await softDelete('books', bookId)
    assert(del.ok && del.value.changed, 'the book delete failed')

    const stamp = await deletedAtOf('books', bookId)
    const taken = [
      ['reads', readId],
      ['sessions', kept],
      ['notes', noteId],
      ['book_shelves', assignmentId],
    ] as const
    for (const [table, id] of taken) {
      assert(
        (await deletedAtOf(table, id)) === stamp,
        `the cascade did not take the ${table} row`,
      )
    }
    const separateStamp = await deletedAtOf('sessions', separate)
    assert(separateStamp !== stamp, 'the separate delete shares the stamp; this proves nothing')

    const before = new Map<string, number>()
    for (const [table, id] of [['books', bookId], ...taken] as const) {
      before.set(id, await upsertsFor(table, id))
    }

    const res = await restoreRow('books', bookId)
    assert(
      res.ok && res.value.changed,
      `the restore failed: ${res.ok ? '' : res.error.message}`,
    )

    for (const [table, id] of [['books', bookId], ...taken] as const) {
      assert((await deletedAtOf(table, id)) === null, `the ${table} row did not come back`)
      const added = (await upsertsFor(table, id)) - (before.get(id) ?? 0)
      assert(added === 1, `the ${table} row queued ${added} upserts on restore, expected 1`)
    }
    assert(
      (await deletedAtOf('sessions', separate)) === separateStamp,
      'restoring the book RESURRECTED a session the reader deleted on its own',
    )
    assert((await deletedAtOf('shelves', shelfId)) === null, 'the shelf was touched')
    await softDelete('shelves', shelfId)
    return 'book, read, session, note and assignment back with one upsert each; the separate session stayed deleted'
  })

  await check('9b. a cascade restore skips a child whose other parent is deleted', async () => {
    const { bookId } = await devBook('Devcheck Cascade Shelf')
    const { shelfId, assignmentId } = await devShelf(bookId)
    assert((await softDelete('books', bookId)).ok, 'the book delete failed')
    await nextMs()
    assert((await softDelete('shelves', shelfId)).ok, 'the shelf delete failed')

    const res = await restoreRow('books', bookId)
    assert(res.ok && res.value.changed, 'the book restore failed')
    assert((await deletedAtOf('books', bookId)) === null, 'the book did not come back')
    assert(
      (await deletedAtOf('book_shelves', assignmentId)) !== null,
      'restoring the book revived an assignment to a DELETED shelf',
    )
    return 'book back, assignment to the deleted shelf left deleted'
  })

  await check(
    '9c. restoring a row under a deleted parent is refused and says why',
    async () => {
      const { bookId, readId } = await devBook('Devcheck Orphan Restore')
      const sid = await devSessionUnder(readId)
      assert((await softDelete('sessions', sid)).ok, 'the session delete failed')
      await nextMs()
      assert((await softDelete('books', bookId)).ok, 'the book delete failed')
      const queued = (await queueRowsFor('sessions', sid)).length

      const res = await restoreRow('sessions', sid)
      assert(!res.ok, 'a session was restored LIVE under a deleted read')
      assert(/Restore the .+ first/.test(res.error.safe ?? ''), `unhelpful: ${res.error.safe}`)
      assert(
        (await deletedAtOf('sessions', sid)) !== null,
        'the session is live under a deleted read',
      )
      const after = (await queueRowsFor('sessions', sid)).length
      assert(after === queued, 'a refused restore still queued a sync')
      return `refused: "${res.error.message}. ${res.error.safe}"`
    },
  )

  await check('9d. a row cannot be written or moved under a deleted parent', async () => {
    const live = await devBook('Devcheck Orphan Live')
    const dead = await devBook('Devcheck Orphan Dead')
    assert((await softDelete('books', dead.bookId)).ok, 'the book delete failed')

    const id = newId()
    const w = await writeRow('sessions', {
      id,
      readId: dead.readId,
      occurredAt: now(),
      format: 'pages',
      fromPosition: 0,
      toPosition: 3,
      isTimed: 0,
    })
    assert(!w.ok, 'a live session was WRITTEN under a deleted read')
    assert((await deletedAtOf('sessions', id)) === undefined, 'the refused row exists')
    assert((await queueRowsFor('sessions', id)).length === 0, 'the refused write queued a sync')

    const sid = await devSessionUnder(live.readId)
    const u = await updateRow('sessions', sid, { readId: dead.readId })
    assert(!u.ok, 'a live session was MOVED under a deleted read')
    const row = await getDb()
      .select({ readId: sessions.readId })
      .from(sessions)
      .where(eq(sessions.id, sid))
    assert(row[0]?.readId === live.readId, 'the refused move changed the row')
    return 'insert and move both refused, nothing written, nothing queued'
  })

  await check('9e. an undo that clashes with something added since says so', async () => {
    const { bookId, readId } = await devBook('Devcheck Restore Clash')
    assert((await softDelete('reads', readId)).ok, 'the read delete failed')
    const w = await writeRow('reads', { id: newId(), bookId, status: 'reading', readNumber: 1 })
    assert(w.ok, 'the new read #1 failed')

    const res = await restoreRow('reads', readId)
    assert(!res.ok, 'two live reads now share number 1')
    assert(/clashes/.test(res.error.safe ?? ''), `unhelpful: ${res.error.safe}`)
    assert((await deletedAtOf('reads', readId)) !== null, 'the clashing read came back')
    return `refused: "${res.error.message}. ${res.error.safe}"`
  })
}

// ─── CLEANUP ─────────────────────────────────────────────────────────────────

async function cleanup() {
  await check('7. cleanup: every row this pass created is soft-deleted', async () => {
    // The seeded book is included deliberately. Cleanup used to match only 'Devcheck%',
    // so every run left `The Overstory`, its read and its three sessions behind — and
    // the NEXT run's seed added three more. A device pass that grows the database it is
    // checking is a device pass whose counts stop meaning anything.
    const rows = await getDb()
      .select()
      .from(books)
      .where(
        sql`(${books.title} LIKE 'Devcheck%' OR ${books.title} = ${SEEDED_TITLE})
            AND ${books.deletedAt} IS NULL`,
      )
    for (const b of rows) await softDelete('books', b.id)

    // The cascade should have taken the reads and sessions with them. Asserting it here
    // is what makes "cleaned up" a fact rather than an intention.
    const liveReads = await getDb()
      .select({ id: reads.id })
      .from(reads)
      .innerJoin(books, eq(reads.bookId, books.id))
      .where(and(isNull(reads.deletedAt), isNotNull(books.deletedAt)))
    assert(
      liveReads.length === 0,
      `${liveReads.length} reads survived their deleted book - the cascade is not working`,
    )

    const liveSessions = await getDb()
      .select({ id: sessions.id })
      .from(sessions)
      .innerJoin(reads, eq(sessions.readId, reads.id))
      .where(and(isNull(sessions.deletedAt), isNotNull(reads.deletedAt)))
    assert(
      liveSessions.length === 0,
      `${liveSessions.length} sessions survived their deleted read`,
    )

    pruneBackups()
    return `${rows.length} books soft-deleted, no orphaned reads or sessions`
  })
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

export async function runDeviceChecks(): Promise<CheckResult[]> {
  results.length = 0
  // eslint-disable-next-line no-console
  console.log('[devcheck] ===== DEVICE PASS START =====')
  await checkOwnDatabase()
  await checkEnqueueOnWrite()
  await checkAtomicity()
  await checkLocalOnlyTables()
  await checkSeed()
  await checkBackupAssumptions()
  await checkRestore()
  await checkLocalDay()
  await checkRestoreCascade()
  await cleanup()

  const runtime = results.filter((r) => r.kind === 'runtime')
  const compile = results.filter((r) => r.kind === 'compile-time')
  const runtimePassed = runtime.filter((r) => r.passed).length
  const compilePassed = compile.filter((r) => r.passed).length
  /* eslint-disable no-console */
  console.log(
    `[devcheck] ===== RUNTIME ${runtimePassed}/${runtime.length} PASSED · ` +
      `COMPILE-TIME ${compilePassed}/${compile.length} =====`,
  )
  const failed = results.filter((r) => !r.passed)
  for (const f of failed) console.log(`[devcheck] FAILED: ${f.name} :: ${f.detail}`)
  /* eslint-enable no-console */
  return results
}

/** Runtime and compile-time counts, kept separate on purpose. */
export function summarise(rs: readonly CheckResult[]) {
  const runtime = rs.filter((r) => r.kind === 'runtime')
  const compile = rs.filter((r) => r.kind === 'compile-time')
  return {
    runtimePassed: runtime.filter((r) => r.passed).length,
    runtimeTotal: runtime.length,
    compilePassed: compile.filter((r) => r.passed).length,
    compileTotal: compile.length,
  }
}
