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

import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { File, Paths } from 'expo-file-system'

import { subscribeDataChanges } from './changes'
import { checkpointWal, dangerouslyExecDevSql, DATABASE_NAME, getDb } from './client'
import { ensureBookDetails } from './bookDetails'
import { ensureLocalCover } from './coverFiles'
import { getFinishedReads } from './finishedReads'
import { books, metadataCache, notes, reads, sessions, syncQueue } from './schema'
import { isCurrentRead } from './currentRead'
import { progressAggregates } from './progressAggregates'
import {
  cacheSearchResults,
  clearLocalRecord,
  restoreRow,
  saveLocalRecord,
  sweepLocalRecords,
  softDelete,
  updateRow,
  writeBatch,
  writeRow,
  writeTogether,
} from './write'
import {
  backupBeforeMigration,
  backupsDirectory,
  listBackups,
  pruneBackups,
  restoreNewestBackup,
} from './backup'
import { SCHEMA_VERSION } from './migrate'
import { seedSampleLibrary, SEEDED_TITLE } from './seed'
import { DRAFT_SOURCE, RUN_SOURCE } from './localRecords'
import { finishTimer, getTimerContext, saveRun, startTimer } from '@/features/timer/queries'
import { currentPosition } from '@/domain/progress'
import { finishedInYear } from '@/domain/finishes'
import { totals } from '@/domain/stats'
// Check 13 drives the session logger's own modules: the device pass exists to run the real
// path, and for Slice 3 the real path starts in the feature, not in write.ts.
import {
  createSession,
  deleteSession,
  getReadingDays,
  restoreSession,
  updateSession,
} from '@/features/session/queries'
import {
  formFromSession,
  newForm,
  newSessionRow,
  sessionPatch,
} from '@/features/session/sessionForm'
import { addFromSearch, searchRemembered } from '@/features/add/queries'
import type { SearchResult } from '@/features/add/searchMerge'
import { startReread } from '@/features/book/queries'
import { checkFinish, formFromRead, withFinishDate } from '@/features/finish/finishForm'
import { getFinishContext, saveFinish } from '@/features/finish/queries'
import { getSessionsSince } from '@/features/stats/queries'
import { getDeletedItems } from '@/features/trash/queries'
import { addDays, now, todayLocalDay, toLocalDay, withLocalTime } from '@/lib/dates'
import { setFault } from '@/lib/faults'
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
    // The migration harness runs under node's SQLite (3.51.3 on 2026-09-13), which is newer
    // than the one expo-sqlite bundles (3.50.3 the same day). Printed here so the gap is a number, not a memory.
    const version = (await getDb().all<{ v: string }>(sql`select sqlite_version() as v`))[0]?.v
    return `${DATABASE_NAME}; SQLite ${version}; the library at ${library.exists ? 'reader.db is untouched' : 'reader.db does not exist here'}`
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

// ─── 10. THE SQL PROGRESS AGGREGATE AGREES WITH domain/stats.ts ──────────────

/**
 * `db/progressAggregates.ts` expresses the counting rule a second time, in SQL, so the
 * Library does not load every session of every book. Two expressions of one rule drift
 * apart silently, so this holds them equal: for real reads, and for a read built from the
 * shapes that break counting — backwards, half-filled, recovered, timed audiobook.
 */
async function checkProgressAggregate() {
  await check('10. the SQL progress aggregate agrees with contribution()', async () => {
    // The awkward shapes, deliberately, so agreement is not only on well-formed seed data.
    const { readId: awkward } = await devSession('Devcheck Aggregate Shapes', now() - DAY)
    const shapes: Parameters<typeof writeRow<'sessions'>>[1][] = [
      {
        id: newId(),
        readId: awkward,
        occurredAt: now() - 2 * DAY,
        format: 'pages',
        fromPosition: 120,
        toPosition: 40,
        isTimed: 0,
      },
      {
        id: newId(),
        readId: awkward,
        occurredAt: now() - 3 * DAY,
        format: 'pages',
        fromPosition: 30,
        toPosition: null,
        isTimed: 0,
      },
      {
        id: newId(),
        readId: awkward,
        occurredAt: now() - 4 * DAY,
        format: 'pages',
        fromPosition: null,
        toPosition: null,
        durationSeconds: 1500,
        isTimed: 1,
      },
      {
        id: newId(),
        readId: awkward,
        occurredAt: now() - 5 * DAY,
        format: 'minutes',
        fromPosition: 0,
        toPosition: 45,
        durationSeconds: 1800,
        isTimed: 1,
      },
      {
        id: newId(),
        readId: awkward,
        occurredAt: now() - 6 * DAY,
        format: 'minutes',
        fromPosition: 45,
        toPosition: 90,
        isTimed: 0,
      },
      {
        id: newId(),
        readId: awkward,
        occurredAt: now() - 7 * DAY,
        format: 'pages',
        fromPosition: null,
        toPosition: null,
        isTimed: 0,
      },
      {
        id: newId(),
        readId: awkward,
        occurredAt: now() - 8 * DAY,
        format: 'pages',
        fromPosition: 10,
        toPosition: 30,
        durationSeconds: 900,
        isTimed: 1,
      },
    ]
    const wrote = await writeBatch('sessions', shapes)
    assert(wrote.ok, 'could not write the awkward sessions')

    const sampled = await getDb()
      .select({ id: reads.id })
      .from(reads)
      .where(
        and(
          isNull(reads.deletedAt),
          sql`exists (select 1 from sessions s where s.read_id = ${reads.id} and s.deleted_at is null)`,
        ),
      )
      .orderBy(sql`random()`)
      .limit(60)
    const ids = [awkward, ...sampled.map((r) => r.id).filter((id) => id !== awkward)]

    const aggregated = await getDb()
      .select({ readId: reads.id, ...progressAggregates })
      .from(reads)
      .leftJoin(sessions, and(eq(sessions.readId, reads.id), isNull(sessions.deletedAt)))
      .where(inArray(reads.id, ids))
      .groupBy(reads.id)
    const byRead = new Map(aggregated.map((a) => [a.readId, a]))

    const mismatches: string[] = []
    for (const readId of ids) {
      const rows = await getDb()
        .select({
          format: sessions.format,
          fromPosition: sessions.fromPosition,
          toPosition: sessions.toPosition,
          durationSeconds: sessions.durationSeconds,
          occurredAt: sessions.occurredAt,
          localDay: sessions.localDay,
        })
        .from(sessions)
        .where(and(eq(sessions.readId, readId), isNull(sessions.deletedAt)))
      const domain = totals(rows)
      const sqlSide = byRead.get(readId)
      if (!sqlSide) {
        mismatches.push(`${readId.slice(0, 8)}: missing from the aggregate`)
        continue
      }
      const pairs: [string, number | null, number | null][] = [
        ['pages', domain.pages, sqlSide.pagesRead],
        ['minutes', Math.round(domain.minutes * 1000), Math.round(sqlSide.minutesRead * 1000)],
        ['unusable', domain.unusable, sqlSide.unusable],
        ['page', currentPosition(rows, 'pages'), sqlSide.page],
        ['minute', currentPosition(rows, 'minutes'), sqlSide.minute],
      ]
      for (const [name, a, b] of pairs) {
        if (a !== b) mismatches.push(`${readId.slice(0, 8)} ${name}: domain ${a}, sql ${b}`)
      }
    }
    assert(
      mismatches.length === 0,
      `SQL and domain disagree:\n${mismatches.slice(0, 8).join('\n')}`,
    )
    return `${ids.length} reads agree, including 7 awkward sessions`
  })
}

// ─── 11. A BOOK WITH 500 SESSIONS: THE CASCADE, CORRECT AND MEASURED ─────────

/**
 * Filed by the Slice 0 review: "measure a 500-session delete before changing the cascade".
 * The cascade runs synchronously on the JS thread, one UPDATE and one queue row per child,
 * against a budget of 100ms perceived for a tap. This asserts it is CORRECT at that size,
 * and records how long it takes so the decision about optimising it is made on a number.
 */
async function checkLargeCascade() {
  await check('11. deleting and restoring a book with 500 sessions', async () => {
    const { bookId, readId } = await devBook('Devcheck Cascade 500')
    const rows: Parameters<typeof writeRow<'sessions'>>[1][] = []
    for (let i = 0; i < 500; i += 1) {
      rows.push({
        id: newId(),
        readId,
        occurredAt: now() - (500 - i) * 60 * 1000,
        format: 'pages',
        fromPosition: i,
        toPosition: i + 1,
        isTimed: 0,
      })
    }
    const wrote = await writeBatch('sessions', rows)
    assert(wrote.ok, 'could not write 500 sessions')

    const liveSessions = async () =>
      (
        await getDb()
          .select({ n: sql<number>`count(*)` })
          .from(sessions)
          .where(and(eq(sessions.readId, readId), isNull(sessions.deletedAt)))
      )[0]?.n ?? -1
    const deletes = async () =>
      (
        await getDb()
          .select({ n: sql<number>`count(*)` })
          .from(syncQueue)
          .where(and(eq(syncQueue.tableName, 'sessions'), eq(syncQueue.operation, 'delete')))
      )[0]?.n ?? -1

    const deletesBefore = await deletes()
    const t0 = Date.now()
    const del = await softDelete('books', bookId)
    const deleteMs = Date.now() - t0
    assert(del.ok && del.value.changed, 'the delete failed')
    assert((await liveSessions()) === 0, 'sessions survived their deleted book')
    const queued = (await deletes()) - deletesBefore
    assert(queued === 500, `expected 500 session delete rows, got ${queued}`)

    const t1 = Date.now()
    const res = await restoreRow('books', bookId)
    const restoreMs = Date.now() - t1
    assert(res.ok && res.value.changed, 'the restore failed')
    const back = await liveSessions()
    assert(back === 500, `restore brought back ${back} of 500 sessions`)

    return `delete ${deleteMs}ms, restore ${restoreMs}ms, 500 sessions each way`
  })
}

// ─── 12. A BOOK IS LISTED ONCE, BY ITS CURRENT READ ──────────────────────────

/**
 * A book with a finished first read and a second read in progress appeared on both the
 * Finished and the Reading tabs, because lists filtered each read by its own status. Every
 * list of books now filters with `isCurrentRead`. This builds that shape and asserts the
 * predicate selects exactly one read per book, the newest, including when an older read has
 * been deleted.
 */
async function checkCurrentRead() {
  await check('12. a re-read book is listed once, by its current read', async () => {
    const { bookId, readId: first } = await devBook('Devcheck Current Read')
    const finished = await updateRow('reads', first, { status: 'finished' })
    assert(finished.ok && finished.value.changed, 'could not finish the first read')
    const second = newId()
    const wrote = await writeRow('reads', {
      id: second,
      bookId,
      status: 'reading',
      readNumber: 2,
    })
    assert(wrote.ok, 'could not start the second read')

    const listed = async () =>
      getDb()
        .select({ id: reads.id, status: reads.status })
        .from(reads)
        .where(and(eq(reads.bookId, bookId), isNull(reads.deletedAt), isCurrentRead))
    const now2 = await listed()
    assert(now2.length === 1, `the book is listed ${now2.length} times`)
    assert(now2[0]?.id === second, 'the listed read is not the newest')
    assert(now2[0]?.status === 'reading', 'the book is on the wrong tab')

    // Deleting the newest read makes the first one current again: nothing is hidden.
    const gone = await softDelete('reads', second)
    assert(gone.ok && gone.value.changed, 'could not delete the second read')
    const after = await listed()
    assert(
      after.length === 1 && after[0]?.id === first,
      'the older read did not become current',
    )
    return 'one row per book, the newest read; the older one takes over when the newest is deleted'
  })
}

// ─── 13. THE BACKDATED SESSION, THROUGH THE LOGGER'S OWN PATH ────────────────

async function checkBackdatedSession() {
  /**
   * Slice 3's "done when", as a device check: log a session for a past evening, edit its date
   * afterwards, and every day-bucketed reader of it (the streak, the pace chart, Recently
   * Deleted) follows. 8a to 8c prove write.ts derives local_day; this proves the logger hands
   * write.ts the right instant and the right patch, on a real SQLite file in the phone's zone.
   */
  await check(
    '13. a session backdated to 11pm, then moved to 4am, lands on the reader’s days',
    async () => {
      const { readId } = await devBook('Devcheck Backdated Session')
      const want = await updateRow('reads', readId, { status: 'want' })
      assert(want.ok && want.value.changed, 'could not put the read on Want')

      // 11pm six days ago, as the logger builds it: a new form, then the When pick.
      const eleven = withLocalTime(now() - 6 * DAY, 23, 0)
      const form = {
        ...newForm('pages', { pages: null, minutes: null }, now()),
        to: '28',
        occurredAt: eleven,
      }
      const sessionId = newId()
      const created = await createSession(
        newSessionRow(form, { id: sessionId, readId }),
        'want',
      )
      assert(created.ok, 'the logger could not save')
      assert(created.value.startedReading, 'logging on a Want read did not move it to Reading')
      const firstDay = await dayOf(sessionId)
      assert(
        firstDay === toLocalDay(eleven),
        `saved on ${firstDay}, expected ${toLocalDay(eleven)}`,
      )
      assert(
        firstDay === addDays(todayLocalDay(), -6),
        `11pm six days ago filed under ${firstDay}`,
      )

      // Edited afterwards to 4am two days later, as the editor builds the patch.
      const four = withLocalTime(now() - 4 * DAY, 4, 0)
      const stored = {
        id: sessionId,
        format: 'pages' as const,
        fromPosition: 0,
        toPosition: 28,
        occurredAt: eleven,
        durationSeconds: null,
      }
      const patch = sessionPatch(stored, { ...formFromSession(stored), occurredAt: four })
      assert(
        Object.keys(patch).length === 1 && patch.occurredAt === four,
        `the edit patched ${Object.keys(patch).join(', ')}`,
      )
      const edited = await updateSession(sessionId, patch)
      assert(edited.ok && edited.value.changed, 'the date edit did not save')
      const movedDay = await dayOf(sessionId)
      assert(
        movedDay === addDays(todayLocalDay(), -4),
        `4am four days ago filed under ${movedDay}`,
      )
      const queued = await queueRowsFor('sessions', sessionId)
      assert(
        queued.length === 2,
        `expected 2 queue rows (create, edit), found ${queued.length}`,
      )

      // Every day-bucketed reader follows the edit.
      const days = await getReadingDays()
      assert(days.includes(movedDay), 'the streak days do not include the new day')
      const ownDays = await getDb()
        .selectDistinct({ day: sessions.localDay })
        .from(sessions)
        .where(and(eq(sessions.readId, readId), isNull(sessions.deletedAt)))
      assert(
        ownDays.length === 1 && ownDays[0]?.day === movedDay,
        `the read's sessions sit on ${ownDays.map((d) => d.day).join(', ')}`,
      )
      const pace = await getSessionsSince(addDays(todayLocalDay(), -13))
      assert(
        pace.some((s) => s.occurredAt === four && s.localDay === movedDay),
        'the pace chart query does not see the session on its new day',
      )

      // Delete, find it in Recently Deleted, restore it on the same day.
      const gone = await deleteSession(sessionId)
      assert(gone.ok && gone.value.changed, 'delete did not change anything')
      const trash = await getDeletedItems()
      assert(
        trash.some((t) => t.kind === 'session' && t.id === sessionId),
        'the deleted session is not in Recently Deleted',
      )
      // The undo toast's restore must tell the screen underneath it (db/changes.ts).
      let heard = 0
      const unsubscribe = subscribeDataChanges(() => (heard += 1))
      const back = await restoreSession(sessionId)
      unsubscribe()
      assert(heard === 1, `the restore signalled ${heard} changes, expected 1`)
      assert(back.ok && back.value.changed, 'restore did not change anything')
      assert((await dayOf(sessionId)) === movedDay, 'restore moved the session to another day')

      // A forced save failure writes nothing.
      const failedId = newId()
      setFault(__DEV__, 'sessionSave', true)
      try {
        const refused = await createSession(
          newSessionRow(form, { id: failedId, readId }),
          'reading',
        )
        assert(!refused.ok, 'an armed save fault still saved')
      } finally {
        setFault(__DEV__, 'sessionSave', false)
      }
      const ghost = await getDb()
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, failedId))
      assert(ghost.length === 0, 'a forced failure left a row behind')

      return `11pm on ${firstDay} -> 4am on ${movedDay}; streak, pace and trash followed; forced failure wrote nothing`
    },
  )
}

// ─── 14. ADDING A BOOK ───────────────────────────────────────────────────────

async function checkAddingBooks() {
  await check(
    '14a. a book and its first read are written together, or not at all',
    async () => {
      const { bookId: existing } = await devBook('Devcheck Together Existing')
      const orphan = newId()
      // The second row collides with the existing book's read 1, so the transaction must fail,
      // and the first row, a brand-new book, must not survive it.
      const failed = await writeTogether([
        {
          table: 'books',
          values: { id: orphan, title: 'Devcheck Together Orphan', source: 'manual' },
        },
        {
          table: 'reads',
          values: { id: newId(), bookId: existing, status: 'reading', readNumber: 1 },
        },
      ])
      assert(!failed.ok, 'a colliding read was accepted')
      const left = await getDb()
        .select({ id: books.id })
        .from(books)
        .where(eq(books.id, orphan))
      assert(left.length === 0, 'the new book survived its failed read: a book with no read')
      const queued = await queueRowsFor('books', orphan)
      assert(queued.length === 0, 'the rolled-back book was still queued for sync')

      const bookId = newId()
      const done = await writeTogether([
        {
          table: 'books',
          values: { id: bookId, title: 'Devcheck Together Book', source: 'manual' },
        },
        { table: 'reads', values: { id: newId(), bookId, status: 'want', readNumber: 1 } },
      ])
      assert(done.ok, 'the good pair failed')
      const listed = await getDb()
        .select({ status: reads.status })
        .from(reads)
        .where(and(eq(reads.bookId, bookId), isNull(reads.deletedAt), isCurrentRead))
      assert(
        listed.length === 1 && listed[0]?.status === 'want',
        'the added book is not listed once, on Want',
      )
      return 'the collision rolled back both rows and queued nothing; the good pair lists once'
    },
  )

  await check(
    '14b. remembered search results never touch the sync queue, and are found again',
    async () => {
      const before = (await getDb().select({ id: syncQueue.id }).from(syncQueue)).length
      const sourceId = `devcheck-${newId()}`
      const result: SearchResult = {
        key: `openlibrary:${sourceId}`,
        source: 'openlibrary',
        sourceId,
        title: 'Devcheck Godāna Remembered',
        subtitle: null,
        authors: ['Munshi Premchand'],
        publisher: null,
        publishedYear: 1936,
        pageCount: 365,
        isbn13: null,
        isbn10: null,
        isbns: [],
        coverUrl: null,
        description: null,
        categories: [],
        previewUrl: null,
        sources: ['openlibrary'],
      }
      const cached = await cacheSearchResults([
        { source: result.source, sourceId, payload: JSON.stringify(result) },
      ])
      assert(cached.ok, 'the cache write failed')
      const after = (await getDb().select({ id: syncQueue.id }).from(syncQueue)).length
      assert(after === before, `the cache queued ${after - before} sync rows`)
      // Accent-free, lower case, and a prefix: how a reader types it offline.
      const found = await searchRemembered('devcheck godana premch')
      assert(
        found.some((r) => r.sourceId === sourceId),
        'the remembered result was not found',
      )
      dangerouslyExecDevSql(`DELETE FROM metadata_cache WHERE source_id = '${sourceId}'`)
      return 'cached without a queue row; found by "devcheck godana premch"'
    },
  )

  await check(
    '14c. a book added from search keeps a local cover that survives offline',
    async () => {
      // A real Open Library cover (Piranesi). This check needs a network, as adding does.
      const coverUrl = 'https://covers.openlibrary.org/b/id/10226290-M.jpg'
      const added = await addFromSearch(
        {
          key: 'openlibrary:devcheck-cover',
          source: 'openlibrary',
          sourceId: 'devcheck-cover',
          title: 'Devcheck Cover Book',
          subtitle: null,
          authors: ['Susanna Clarke'],
          publisher: null,
          publishedYear: 2020,
          pageCount: 272,
          isbn13: null,
          isbn10: null,
          isbns: [],
          coverUrl,
          description: null,
          categories: [],
          previewUrl: null,
          sources: ['openlibrary'],
        },
        'reading',
      )
      assert(added.ok, 'addFromSearch failed')
      const bookId = added.value.bookId
      // The add starts the download without waiting; ask again, which waits for this one.
      let local: string | null = null
      for (let i = 0; i < 40 && local === null; i += 1) {
        const row = await getDb()
          .select({ p: books.coverLocalPath })
          .from(books)
          .where(eq(books.id, bookId))
        local = row[0]?.p ?? null
        if (local === null) await new Promise((r) => setTimeout(r, 250))
      }
      assert(local !== null, 'no local cover recorded within 10 s (is the phone online?)')
      const file = new File(local)
      assert(
        file.exists && (file.size ?? 0) > 1000,
        `the cover file is missing or empty (${file.size ?? 0} B)`,
      )
      const row = await getDb()
        .select({
          url: books.coverUrl,
          source: books.source,
          sourceId: books.sourceId,
          pages: books.pageCount,
        })
        .from(books)
        .where(eq(books.id, bookId))
      assert(
        row[0]?.url === coverUrl && row[0]?.source === 'openlibrary',
        'the book lost its metadata',
      )
      // A second attempt in the same launch does nothing: no re-download on every open.
      assert(
        (await ensureLocalCover(bookId, coverUrl)) === null,
        'the cover was downloaded twice',
      )
      return `cover saved locally (${file.size} B), metadata kept (${row[0]?.pages} pages)`
    },
  )
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

// ─── 15. FINISH, RE-READ, FINISH AGAIN: TWO READS, EACH IN ITS OWN YEAR ──────

async function checkFinishAndReread() {
  /**
   * Slice 5's "done when", through the finish flow's own path (features/finish) and the actions
   * sheet's re-read (features/book): finishing then re-reading a book produces two reads with
   * separate ratings and dates, and each counts in its own year. Plus the owner's named case:
   * finishing moves the book off Reading.
   *
   * The first read is finished at 11 pm on last New Year's Eve, local time: the one instant a
   * UTC bucket would file under this year in a zone behind UTC, and the next in one ahead of it.
   */
  await check(
    '15. finish, re-read and finish again: two reads, each in its own year',
    async () => {
      const { bookId, readId: first } = await devBook('Devcheck Finish Reread')
      const thisYear = new Date(now()).getFullYear()
      const lastYear = thisYear - 1
      const newYearsEve = new Date(lastYear, 11, 31, 23, 0, 0, 0).getTime()

      const s1 = await writeRow('sessions', {
        id: newId(),
        readId: first,
        occurredAt: new Date(lastYear, 11, 30, 20, 0, 0, 0).getTime(),
        format: 'pages',
        fromPosition: 0,
        toPosition: 240,
        isTimed: 0,
      })
      assert(s1.ok, 'could not log the first read')

      // ── Finish the first read, as the finish screen does. ──
      const ctx1 = await getFinishContext(first)
      assert(ctx1 !== null, 'the finish flow could not open the first read')
      const form1 = {
        ...withFinishDate(formFromRead(ctx1.read, now()), newYearsEve),
        rating: 4,
        review: 'Devcheck first time',
      }
      assert(checkFinish(form1, ctx1.read, now()).canSave, 'the first finish was refused')
      const saved1 = await saveFinish(ctx1.read, form1)
      assert(saved1.ok && saved1.value.changed, 'the first finish did not save')

      const onReading = async () =>
        getDb()
          .select({ id: reads.id })
          .from(reads)
          .where(
            and(
              eq(reads.bookId, bookId),
              eq(reads.status, 'reading'),
              isNull(reads.deletedAt),
              isCurrentRead,
            ),
          )
      assert(
        (await onReading()).length === 0,
        'the finished book is still on Currently Reading',
      )

      // ── Re-read, through the actions sheet's own call, and finish again this year. ──
      const reread = await startReread(bookId)
      assert(reread.ok, 'the re-read did not start')
      const secondRows = await getDb()
        .select({ id: reads.id })
        .from(reads)
        .where(and(eq(reads.bookId, bookId), eq(reads.readNumber, 2), isNull(reads.deletedAt)))
      const second = secondRows[0]?.id
      assert(second !== undefined, 'no second read was created')
      assert((await onReading()).length === 1, 'the re-read is not on Currently Reading')

      const s2 = await writeRow('sessions', {
        id: newId(),
        readId: second,
        occurredAt: withLocalTime(now(), 0, 1),
        format: 'pages',
        fromPosition: 0,
        toPosition: 240,
        isTimed: 0,
      })
      assert(s2.ok, 'could not log the second read')
      const ctx2 = await getFinishContext(second)
      assert(ctx2 !== null, 'the finish flow could not open the second read')
      assert(ctx2.read.rating === null, 'the re-read started with the first read’s rating')
      const form2 = { ...formFromRead(ctx2.read, now()), rating: 2.5 }
      const saved2 = await saveFinish(ctx2.read, form2)
      assert(saved2.ok && saved2.value.changed, 'the second finish did not save')
      assert((await onReading()).length === 0, 'the re-read, finished, is still on Reading')

      // ── Two rows, independent. ──
      const both = await getDb()
        .select({
          id: reads.id,
          status: reads.status,
          rating: reads.rating,
          review: reads.review,
          finishedAt: reads.finishedAt,
          readNumber: reads.readNumber,
        })
        .from(reads)
        .where(and(eq(reads.bookId, bookId), isNull(reads.deletedAt)))
        .orderBy(reads.readNumber)
      assert(both.length === 2, `the book has ${both.length} live reads, not 2`)
      const [r1, r2] = both
      assert(r1 !== undefined && r2 !== undefined, 'reads missing')
      assert(r1.id === first && r2.id === second, 'the reads are not the ones finished')
      assert(r1.status === 'finished' && r2.status === 'finished', 'a read is not finished')
      assert(r1.rating === 4, `the first read's rating is ${r1.rating}, not 4`)
      assert(r2.rating === 2.5, `the second read's rating is ${r2.rating}, not 2.5`)
      assert(
        r1.review === 'Devcheck first time' && r2.review === null,
        'the notes crossed over',
      )
      assert(r1.finishedAt === newYearsEve, 'finishing the re-read moved the first read’s date')
      assert(
        r2.finishedAt !== null && r2.finishedAt !== r1.finishedAt,
        'the dates are not separate',
      )

      // ── Each in its own year, by the query Stats will use. ──
      const finished = await getFinishedReads()
      const inYear = (year: number, readId: string) =>
        finishedInYear(finished, year) - finishedInYear(finished, year, readId)
      assert(inYear(lastYear, first) === 1, `the first read does not count in ${lastYear}`)
      assert(inYear(thisYear, first) === 0, `the first read also counts in ${thisYear}`)
      assert(inYear(thisYear, second) === 1, `the second read does not count in ${thisYear}`)
      assert(inYear(lastYear, second) === 0, `the second read also counts in ${lastYear}`)

      return `read 1: 4★, ${toLocalDay(r1.finishedAt)} counts in ${lastYear}; read 2: 2.5★, ${toLocalDay(r2.finishedAt)} counts in ${thisYear}; off Reading both times`
    },
  )
}

// ─── 16. A BOOK'S DETAILS, FETCHED ONCE, NEVER OVER THE READER'S WORDS ─────

async function checkBookDetails() {
  /**
   * Needs a network, as 14c does: a real Open Library work (Piranesi). The node tests hold the
   * parsing on captured responses; this holds the path: the fetch, the write, the once-only mark,
   * and a reader's description surviving it.
   */
  await check(
    '16. book details are fetched once, and never replace the reader’s words',
    async () => {
      const fetchedId = newId()
      const keptId = newId()
      const a = await writeRow('books', {
        id: fetchedId,
        title: 'Devcheck Details Fetched',
        source: 'openlibrary',
        sourceId: 'OL20893680W',
      })
      const b = await writeRow('books', {
        id: keptId,
        title: 'Devcheck Details Kept',
        source: 'openlibrary',
        sourceId: 'OL20893680W',
        description: 'Devcheck reader words',
      })
      assert(a.ok && b.ok, 'could not create the test books')

      assert(await ensureBookDetails(fetchedId), 'nothing was written (offline?)')
      assert(await ensureBookDetails(keptId), 'nothing was written for the second book')
      const row = async (id: string) =>
        (
          await getDb()
            .select({
              description: books.description,
              categories: books.categories,
              checked: books.detailsCheckedAt,
            })
            .from(books)
            .where(eq(books.id, id))
        )[0]
      const fetched = await row(fetchedId)
      const kept = await row(keptId)
      assert(fetched?.description?.includes('Piranesi') === true, 'no description was stored')
      assert(!fetched.description.includes('**'), 'the description kept its Markdown')
      assert(
        fetched.categories !== null && fetched.checked !== null,
        'categories or the mark missing',
      )
      assert(
        kept?.description === 'Devcheck reader words',
        'the reader’s description was replaced',
      )

      // Once per launch, and once per book: a second call does nothing.
      assert(!(await ensureBookDetails(fetchedId)), 'the same book was fetched twice')
      return `${fetched.description.length} characters stored; the reader's description untouched`
    },
  )
}

// ─── 17. A NOTE IS THE BOOK'S, AND SURVIVES EVERYTHING THAT HAPPENS TO A READ ─

async function checkNotesSurviveReads() {
  /**
   * Slice 5b's done-when: "a quote survives a re-read of that book".
   *
   * Asserted in the direction the guarantee runs, which is the direction that can fail
   * silently. `notes` is deliberately NOT a cascade child of `reads` in write.ts, so the
   * sharp step is 3: deleting the read a note was written during must leave the note alone.
   * If notes were ever added to that cascade, every quote from a first read would vanish the
   * day the reader tidied up an old read, and nothing else in the app would notice.
   */
  await check('17. a note survives a re-read, and its read being deleted', async () => {
    const bookId = newId()
    const read1 = newId()
    const read2 = newId()
    const noteId = newId()
    const created = await writeTogether([
      {
        table: 'books',
        values: { id: bookId, title: 'Devcheck Notes Survive', pageCount: 300 },
      },
      { table: 'reads', values: { id: read1, bookId, readNumber: 1, status: 'reading' } },
    ])
    assert(created.ok, 'could not create the book and its first read')

    // Written during read 1, against the BOOK, with the read for provenance only.
    const wrote = await writeRow('notes', {
      id: noteId,
      bookId,
      readId: read1,
      type: 'quote',
      content: 'Devcheck: the trees are the connective tissue.',
      page: 212,
    })
    assert(wrote.ok, 'could not write the note')

    const liveNote = async () =>
      (
        await getDb()
          .select({
            id: notes.id,
            readId: notes.readId,
            content: notes.content,
            page: notes.page,
          })
          .from(notes)
          .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
      )[0]

    // 1. Finish read 1 and start read 2, which is what a re-read is.
    const finished = await updateRow('reads', read1, { status: 'finished', finishedAt: now() })
    const second = await writeRow('reads', {
      id: read2,
      bookId,
      readNumber: 2,
      status: 'reading',
    })
    assert(finished.ok && second.ok, 'could not finish read 1 and start read 2')
    const afterReread = await liveNote()
    assert(afterReread !== undefined, 'THE NOTE DID NOT SURVIVE THE RE-READ')
    assert(afterReread.readId === read1, 'the note moved to the new read')
    assert(afterReread.page === 212, 'the note lost its page')

    // 2. The note belongs to the book, so the book's list still has it under read 2.
    const forBook = await getDb()
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.bookId, bookId), isNull(notes.deletedAt)))
    assert(forBook.length === 1, `the book should have 1 note, it has ${forBook.length}`)

    // 3. THE SHARP ONE: deleting the read it was written during must not take it.
    const deletedRead = await softDelete('reads', read1)
    assert(deletedRead.ok, 'could not delete the first read')
    const afterReadDeleted = await liveNote()
    assert(
      afterReadDeleted !== undefined,
      'THE NOTE WENT WITH ITS READ - notes must not be a cascade child of reads',
    )

    // 4. Deleting the BOOK does take it, and restoring the book brings it back.
    const deletedBook = await softDelete('books', bookId)
    assert(deletedBook.ok, 'could not delete the book')
    assert((await liveNote()) === undefined, 'the note outlived its deleted book')
    const restored = await restoreRow('books', bookId)
    assert(restored.ok, 'could not restore the book')
    const afterRestore = await liveNote()
    assert(afterRestore !== undefined, 'restoring the book did not bring its note back')
    assert(afterRestore.content.includes('connective tissue'), 'the note came back changed')

    return 'the note survived the re-read and its read being deleted, and came back with the book'
  })
}

// ─── 18. A DRAFT IS NOT A NOTE ───────────────────────────────────────────────

async function checkDraftsAreLocal() {
  /**
   * A half-written note lives in `metadata_cache`, which never syncs. The claim worth holding
   * against a real database is the negative one: writing a draft must leave NO queue row and
   * NO note. If a draft ever reached `notes`, every abandoned thought would appear in the
   * reader's list and, from Slice 8, on their other phone.
   */
  await check(
    '18. a draft writes no note and no queue row, and clears completely',
    async () => {
      const key = `devcheck:${newId()}`
      const before = (await getDb().select({ id: syncQueue.id }).from(syncQueue)).length
      const notesBefore = (await getDb().select({ id: notes.id }).from(notes)).length

      const saved = await saveLocalRecord(
        DRAFT_SOURCE,
        key,
        '{"type":"note","content":"half a","page":""}',
      )
      assert(saved.ok, 'could not save the draft')

      const stored = await getDb()
        .select({ payload: metadataCache.payload })
        .from(metadataCache)
        .where(and(eq(metadataCache.source, DRAFT_SOURCE), eq(metadataCache.sourceId, key)))
      assert(stored.length === 1, `the draft should be stored once, found ${stored.length}`)

      const after = (await getDb().select({ id: syncQueue.id }).from(syncQueue)).length
      const notesAfter = (await getDb().select({ id: notes.id }).from(notes)).length
      assert(
        after === before,
        `the draft enqueued ${after - before} sync rows; it must enqueue 0`,
      )
      assert(notesAfter === notesBefore, 'the draft created a row in notes')

      const cleared = await clearLocalRecord(DRAFT_SOURCE, key)
      assert(cleared.ok, 'could not clear the draft')
      const left = await getDb()
        .select({ payload: metadataCache.payload })
        .from(metadataCache)
        .where(and(eq(metadataCache.source, DRAFT_SOURCE), eq(metadataCache.sourceId, key)))
      assert(left.length === 0, 'the draft was still there after being cleared')

      return 'a draft stored and cleared, with 0 queue rows and 0 notes'
    },
  )
}

// ─── 19. A TIMED SESSION, THROUGH THE TIMER'S OWN WRITE PATH ─────────────────

async function checkTimedSession() {
  /**
   * The timer writes to `sessions` like everything else, so the class of bug device checks
   * exist for applies to it — and until 2026-09-19 none of the 36 checks touched a timed
   * session at all.
   *
   * Asserted in the direction that can fail silently: an OPEN timed session is what the
   * launch recovery gate looks for, so getting its shape wrong means either a reader is asked
   * about a session that is finished, or never asked about one that is not.
   */
  await check(
    '19. a timed session is open while it runs and closed when it finishes',
    async () => {
      const bookId = newId()
      const readId = newId()
      const created = await writeTogether([
        {
          table: 'books',
          values: { id: bookId, title: 'Devcheck Timed Session', pageCount: 300 },
        },
        { table: 'reads', values: { id: readId, bookId, readNumber: 1, status: 'reading' } },
      ])
      assert(created.ok, 'could not create the book and its read')

      const openBefore = await getDb()
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.isTimed, 1),
            isNull(sessions.durationSeconds),
            isNull(sessions.deletedAt),
          ),
        )
      const context = await getTimerContext(bookId)
      assert(context !== null, 'the timer could not find the book it was just given')
      const started = await startTimer(context)
      assert(started.ok, 'starting the timer failed')
      const sessionId = started.value.sessionId

      // OPEN: is_timed = 1 with no duration. That pair IS the schema's "still running".
      const openRow = (
        await getDb()
          .select({
            isTimed: sessions.isTimed,
            duration: sessions.durationSeconds,
            from: sessions.fromPosition,
            to: sessions.toPosition,
            localDay: sessions.localDay,
          })
          .from(sessions)
          .where(eq(sessions.id, sessionId))
      )[0]
      assert(openRow !== undefined, 'Start wrote no session row')
      assert(openRow.isTimed === 1, 'the timer wrote a session that is not marked timed')
      assert(openRow.duration === null, 'a running timer already has a duration')
      assert(openRow.to === null, 'a running timer already has an end position')
      assert(openRow.localDay === toLocalDay(now()), 'local_day was not derived for the timer')

      const openDuring = await getDb()
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.isTimed, 1),
            isNull(sessions.durationSeconds),
            isNull(sessions.deletedAt),
          ),
        )
      assert(
        openDuring.length === openBefore.length + 1,
        `expected one more open session, went from ${openBefore.length} to ${openDuring.length}`,
      )

      // Exactly one queue row so far: the insert. A heartbeat must never enqueue.
      await saveRun({ ...started.value.run, lastBeatAt: now() })
      await saveRun({ ...started.value.run, lastBeatAt: now() + 1 })
      const afterBeats = await queueRowsFor('sessions', sessionId)
      assert(
        afterBeats.length === 1,
        `two heartbeats queued ${afterBeats.length - 1} extra sync rows; they must queue none`,
      )

      // CLOSED: finishing writes the duration, which is what takes it out of the gate's sight.
      const finished = await finishTimer(sessionId, 754, 120)
      assert(finished.ok, 'finishing the timer failed')
      const closed = (
        await getDb()
          .select({ duration: sessions.durationSeconds, to: sessions.toPosition })
          .from(sessions)
          .where(eq(sessions.id, sessionId))
      )[0]
      assert(closed?.duration === 754, `duration is ${closed?.duration}, expected 754`)
      assert(closed.to === 120, 'the end position was not written')

      const openAfter = await getDb()
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.isTimed, 1),
            isNull(sessions.durationSeconds),
            isNull(sessions.deletedAt),
          ),
        )
      assert(
        openAfter.length === openBefore.length,
        `${openAfter.length - openBefore.length} sessions are still open after finishing`,
      )
      const finalQueue = await queueRowsFor('sessions', sessionId)
      assert(
        finalQueue.length === 2,
        `expected 2 queue rows (insert, update), got ${finalQueue.length}`,
      )
      return `open then closed; 754s written; ${finalQueue.length} queue rows, none from heartbeats`
    },
  )
}

// ─── 20. THE SWEEP TAKES ORPHANS AND LEAVES THE READER'S WORK ────────────────

async function checkLocalRecordSweep() {
  /**
   * The sweep's danger is not that it misses something — it is that it takes something.
   * A draft for a live book is the reader's half-written note, and no age makes it rubbish.
   * So this asserts both directions, and the KEEP direction is the one that matters.
   */
  await check('20. the sweep removes orphaned local records and keeps live ones', async () => {
    const liveBookId = newId()
    const deadBookId = newId()
    const readId = newId()
    const created = await writeTogether([
      { table: 'books', values: { id: liveBookId, title: 'Devcheck Sweep Live' } },
      { table: 'books', values: { id: deadBookId, title: 'Devcheck Sweep Dead' } },
      {
        table: 'reads',
        values: { id: readId, bookId: liveBookId, readNumber: 1, status: 'reading' },
      },
    ])
    assert(created.ok, 'could not create the sweep books')

    // A finished timed session: its run is rubbish the moment the duration is written.
    const doneSessionId = newId()
    const doneSession = await writeRow('sessions', {
      id: doneSessionId,
      readId,
      occurredAt: now(),
      format: 'pages',
      fromPosition: 0,
      toPosition: 10,
      durationSeconds: 60,
      isTimed: 1,
      note: null,
    })
    assert(doneSession.ok, 'could not create the finished session')

    const deletedBook = await softDelete('books', deadBookId)
    assert(deletedBook.ok, 'could not delete the sweep book')

    const records = [
      { source: RUN_SOURCE, key: doneSessionId, why: 'run for a finished session' },
      { source: RUN_SOURCE, key: newId(), why: 'run for a session that does not exist' },
      { source: DRAFT_SOURCE, key: `new:${deadBookId}`, why: 'draft for a deleted book' },
      { source: DRAFT_SOURCE, key: `edit:${newId()}`, why: 'draft for a note that is gone' },
    ]
    for (const r of records) {
      const saved = await saveLocalRecord(r.source, r.key, '{"kept":false}')
      assert(saved.ok, `could not write the ${r.why}`)
    }
    // The one that must SURVIVE: a half-written note for a book that is still here.
    const keeper = `new:${liveBookId}`
    const kept = await saveLocalRecord(DRAFT_SOURCE, keeper, '{"content":"half a thought"}')
    assert(kept.ok, 'could not write the draft that must survive')

    const swept = await sweepLocalRecords()
    assert(swept.ok, 'the sweep failed')

    const left = await getDb()
      .select({ source: metadataCache.source, sourceId: metadataCache.sourceId })
      .from(metadataCache)
      .where(inArray(metadataCache.source, [RUN_SOURCE, DRAFT_SOURCE]))
    const leftKeys = left.map((r) => `${r.source}:${r.sourceId}`)
    for (const r of records) {
      assert(!leftKeys.includes(`${r.source}:${r.key}`), `the sweep left the ${r.why} behind`)
    }
    assert(
      leftKeys.includes(`${DRAFT_SOURCE}:${keeper}`),
      "THE SWEEP TOOK A LIVE BOOK'S DRAFT — the reader's half-written note",
    )
    return `${swept.value} orphans removed, the live draft kept`
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
  await checkProgressAggregate()
  await checkLargeCascade()
  await checkCurrentRead()
  await checkBackdatedSession()
  await checkAddingBooks()
  await checkFinishAndReread()
  await checkBookDetails()
  await checkNotesSurviveReads()
  await checkDraftsAreLocal()
  await checkTimedSession()
  await checkLocalRecordSweep()
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
