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

export type Database = ReturnType<typeof getDb>
