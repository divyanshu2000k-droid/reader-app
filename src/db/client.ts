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

import * as schema from './schema'

export const DATABASE_NAME = 'reader.db'

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
 */
export function runInTransaction(task: () => void): void {
  openHandle().withTransactionSync(task)
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
