/**
 * src/db/client.ts
 *
 * The database is the truth. The UI is a view of it. Never hold app data in component
 * state that is not derived from here.
 */

import { drizzle } from 'drizzle-orm/expo-sqlite'
import * as SQLite from 'expo-sqlite'

import * as schema from './schema'

export const DATABASE_NAME = 'reader.db'

/**
 * `foreign_keys` is OFF by default in SQLite and must be enabled per connection.
 * WAL is the right journal mode for a phone: readers never block the writer, which is
 * what keeps the Library scrolling while a session saves.
 */
export const sqliteDb = SQLite.openDatabaseSync(DATABASE_NAME, {
  enableChangeListener: true,
})

sqliteDb.execSync('PRAGMA journal_mode = WAL;')
sqliteDb.execSync('PRAGMA foreign_keys = ON;')

export const db = drizzle(sqliteDb, { schema })

export type Database = typeof db
