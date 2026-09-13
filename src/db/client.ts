/**
 * src/db/client.ts
 *
 * The database is the truth. The UI is a view of it. Never hold app data in component
 * state that is not derived from here.
 *
 * The connection is opened lazily rather than at module import. Opening at import means
 * synchronous native work on the startup path, against a sub-2-second cold-start budget,
 * and a failure there is an unrecoverable module-load crash that no error boundary can
 * catch.
 *
 * The raw expo-sqlite handle is deliberately NOT exported. It would be a way to write to
 * the database without going through `write.ts`, which is the one thing the whole sync
 * design depends on not being possible.
 */

import { drizzle } from 'drizzle-orm/expo-sqlite'
import * as SQLite from 'expo-sqlite'

import type { AppliedMigrations } from './migrationPlan'
import * as schema from './schema'
import { databaseChoice } from '@/lib/config'
import { DATABASE_FILES } from '@/lib/databaseChoice'

/**
 * THE DEVICE PASS AND THE SANDBOX RUN ON THEIR OWN DATABASES, IN DEVELOPMENT BUILDS ONLY.
 *
 * `EXPO_PUBLIC_DEVICE_PASS=1` opens `devcheck.db`, and `EXPO_PUBLIC_SANDBOX_DB=1` opens
 * `sandbox.db`. A release build always opens `reader.db` (lib/databaseChoice.ts). With the
 * device-pass flag, the whole app opens `devcheck.db` instead, from launch:
 * the gates, the migrations, the write path and the checks all use it, and the reader's
 * library is not opened at all.
 *
 * The pass writes to the real database otherwise, which it did twice. It seeds, deletes,
 * renames `sync_queue`, restores backups OVER the live file, and leaves soft-deleted rows
 * and queue entries behind. One deliberately broken run left two orphans in the owner's
 * library, and repairing those is what deleted a live WAL holding 2.3 MB of committed data.
 *
 * Chosen over switching the handle once the app is running: that mutates global state
 * under live queries, which is the class of bug this codebase keeps paying for. Deciding
 * once, before anything opens, cannot half-apply.
 */
export const DATABASE_NAME = DATABASE_FILES[databaseChoice]

let handle: SQLite.SQLiteDatabase | null = null
let database: ReturnType<typeof drizzle<typeof schema>> | null = null

function openHandle(): SQLite.SQLiteDatabase {
  if (handle) return handle
  handle = SQLite.openDatabaseSync(DATABASE_NAME, { enableChangeListener: true })
  // `foreign_keys` is OFF by default in SQLite and must be set per connection.
  // WAL is the right journal mode for a phone: readers never block the writer, which is
  // what keeps the Library scrolling while a session saves.
  handle.execSync('PRAGMA journal_mode = WAL;')
  handle.execSync('PRAGMA foreign_keys = ON;')
  return handle
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!database) database = drizzle(openHandle(), { schema })
  return database
}

/**
 * Fold the write-ahead log back into the main database file.
 *
 * Required before copying the database for a backup. In WAL mode a committed
 * transaction can live entirely in `reader.db-wal` until a checkpoint, so a plain copy
 * of `reader.db` alone can be missing the reader's most recent sessions. See backup.ts.
 */
export function checkpointWal(): void {
  openHandle().execSync('PRAGMA wal_checkpoint(TRUNCATE);')
}

/**
 * Run `task` inside a real SQLite transaction, synchronously.
 *
 * THIS MUST BE USED INSTEAD OF drizzle's `db.transaction()` WITH AN ASYNC CALLBACK.
 *
 * The expo-sqlite driver is a *synchronous* dialect, so drizzle types
 * `transaction(cb)` as taking a sync callback. Handing it an `async` callback typechecks
 * — the return type is just `Promise<T>` — but the transaction commits the instant the
 * callback returns its promise, before any awaited statement has executed. Every
 * statement then runs outside the transaction and nothing rolls back.
 *
 * The device pass caught exactly this: a failing enqueue left the table row behind, which
 * is the precise failure the single write path exists to prevent.
 *
 * ─── WHY THE PARAMETER IS `() => undefined` AND NOT `() => void` ─────────────
 *
 * This wrapper shipped as `task: () => void`, which reopened the same hole one level up.
 * TypeScript lets ANY function satisfy `() => void`, an `async` one included, and
 * `withTransactionSync` calls `task()` and commits without looking at what it returned. So
 * `runInTransaction(async () => { … })` typechecked, committed immediately and rolled
 * nothing back: bug #1 again, in its own replacement.
 *
 * `() => undefined` rejects a promise-returning task at compile time, because
 * `Promise<void>` is not `undefined`. A task with no `return`, or a bare `return;`, still
 * satisfies it (TypeScript 5.1+). What it cannot see: an un-awaited promise started INSIDE
 * a sync task (`void writeRow(…)`), which runs after the commit. Never call the public
 * write functions from inside a transaction. Pinned in `__tests__/transaction.types.ts`.
 */
export function runInTransaction(task: () => undefined): void {
  openHandle().withTransactionSync(task)
}

/**
 * What `__drizzle_migrations` says about the database on disk: how many migrations are
 * applied (the schema version of the data, which names a backup) and the newest
 * `created_at` (what drizzle itself compares against to decide what is pending — see
 * migrationPlan.ts).
 *
 * Lives here because `client.ts` is the only file permitted to touch raw SQLite, and
 * because HOW it reads matters: `getAllSync` runs the statement to completion and
 * finalizes it. A drizzle `.get()` here left a read transaction open, and the very next
 * thing the caller does is `checkpointWal()` — which cannot truncate the WAL while any
 * reader holds a lock. The device pass caught it as
 * `NativeDatabase.execSync … database table is locked`, surfacing to the reader as
 * "Could not back up your library before updating" and a migration that could never run.
 *
 * One statement for both values, so they describe the same instant.
 *
 * Returns `{ count: 0, lastAppliedAt: null }` when the table does not exist, which is a
 * fresh install. Note that opening the handle creates an empty `reader.db` if there was
 * none, so "the file exists" is not a test for "the reader has data"; this is.
 */
export function appliedMigrations(): AppliedMigrations {
  try {
    const rows = openHandle().getAllSync<{ n: number; last: number | null }>(
      'select count(*) as n, max(created_at) as last from __drizzle_migrations',
    )
    const row = rows[0]
    return {
      count: row?.n ?? 0,
      lastAppliedAt: row?.last === null || row?.last === undefined ? null : Number(row.last),
    }
  } catch (cause) {
    // ONLY a missing table means "fresh install". Every other failure — locked, corrupt,
    // I/O — must surface.
    //
    // This used to be a bare `catch { return 0 }`, which is the same bug the caller
    // exists to fix: 0 labels a full database as the oldest possible schema, so the
    // backup taken from it is named `reader-0-*.db` and every future build will consider
    // it safe to restore. Swallowing an error to produce a plausible number is how a
    // version stops describing a fact.
    if (cause instanceof Error && /no such table/i.test(cause.message)) {
      return { count: 0, lastAppliedAt: null }
    }
    throw cause
  }
}

/**
 * Execute a raw statement. DEV ONLY, and it throws in production.
 *
 * This exists for exactly one caller: the atomicity check in `devchecks.ts`, which has to
 * break the `sync_queue` table on purpose to prove that a failing enqueue rolls the table
 * write back. There is no other way to make the enqueue fail.
 *
 * It lives here rather than in `devchecks.ts` because `client.ts` is the only file
 * permitted to touch raw SQLite, and the no-bypass guard enforces that. Putting it here
 * keeps the guard meaningful instead of quietly carving out an exception for a second
 * file.
 */
export function dangerouslyExecDevSql(statement: string): void {
  if (!__DEV__) {
    throw new Error('dangerouslyExecDevSql is not available in production builds')
  }
  openHandle().execSync(statement)
}

/**
 * Close the connection so the database files can be replaced on disk.
 *
 * REQUIRED BEFORE A RESTORE, and the device pass proved it. On Android, deleting an open
 * file does not affect the already-open file descriptor: SQLite keeps reading and writing
 * the now-unlinked inode, so copying a backup into that path has no effect on the running
 * app. Worse, subsequent writes go to the orphaned inode and are lost at exit.
 *
 * The next `getDb()` reopens against whatever is on disk.
 */
export function closeDatabase(): void {
  if (!handle) return
  try {
    handle.closeSync()
  } finally {
    handle = null
    database = null
  }
}

export type Database = ReturnType<typeof getDb>
