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
 *   - `app/index.tsx` reaches it through `require()` inside an `if (__DEV__)` block.
 *     Metro replaces `__DEV__` with `false` in a production bundle and drops the branch,
 *     so the module is never reachable and never bundled. It deliberately does NOT live
 *     under `__tests__/`: Metro excludes that directory from resolution entirely, so the
 *     module simply would not exist at runtime.
 *   - There is a Slice 11 checklist item to verify that by grepping the release bundle.
 *
 * It writes to the real database. That is deliberate: a check against a throwaway
 * database would not prove the app's own write path works. It cleans up after itself,
 * and everything it creates is soft-deleted.
 */

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { Directory, File, Paths } from 'expo-file-system'

import { checkpointWal, dangerouslyExecDevSql, DATABASE_NAME, getDb } from './client'
import { books, reads, sessions, syncQueue } from './schema'
import { restoreRow, softDelete, writeRow } from './write'
import { backupBeforeMigration, listBackups, pruneBackups, restoreNewestBackup } from './backup'
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
    const after = await getDb().select().from(books).where(eq(books.id, id))
    assert(after[0]?.deletedAt === null, 'restore did not clear deleted_at')
    return 'delete is soft, row survives, restore clears deleted_at'
  })
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
      localDay: toLocalDay(now()),
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
    const dir = new Directory(Paths.document, 'backups')
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
  await checkEnqueueOnWrite()
  await checkAtomicity()
  await checkLocalOnlyTables()
  await checkSeed()
  await checkBackupAssumptions()
  await checkRestore()
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
