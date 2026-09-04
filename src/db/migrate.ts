/**
 * src/db/migrate.ts
 *
 * Runs Drizzle migrations at startup, behind the backup contract.
 *
 * The order is not negotiable:
 *   1. Back up. If the backup fails, DO NOT MIGRATE. Fail closed.
 *   2. Migrate.
 *   3. On success, prune old backups. On failure, restore the newest and report.
 */

import { migrate } from 'drizzle-orm/expo-sqlite/migrator'
import { useEffect, useState } from 'react'

import { backupBeforeMigration, pruneBackups, restoreNewestBackup } from './backup'
import { getDb } from './client'
import migrations from './migrations/migrations'
import { appError, type AppError } from '@/lib/result'

export type MigrationStatus =
  | { readonly state: 'pending' }
  | { readonly ok: true; readonly state: 'done'; readonly version: number }
  | { readonly ok: false; readonly state: 'failed'; readonly error: string }

/** Bumped whenever a migration is added. Names the backup file. */
export const SCHEMA_VERSION = migrations.journal.entries.length

let cached: MigrationStatus = { state: 'pending' }

/**
 * The in-flight promise, memoised.
 *
 * Memoising the RESULT is not enough: two components mounting in the same tick would
 * both see `pending`, both call through, and the app would take two backups and run two
 * concurrent `migrate()` calls against one database. Memoising the promise means the
 * second caller awaits the first.
 */
let inFlight: Promise<MigrationStatus> | null = null

async function performMigrations(): Promise<MigrationStatus> {
  const backup = await backupBeforeMigration(SCHEMA_VERSION)
  if (!backup.ok) {
    // Fail closed. An app on an old schema still works; a half-migrated one may not.
    cached = { ok: false, state: 'failed', error: backup.error.message }
    return cached
  }

  try {
    await migrate(getDb(), migrations)
    pruneBackups()
    cached = { ok: true, state: 'done', version: SCHEMA_VERSION }
    return cached
  } catch (cause) {
    // The running code's version, so a backup from a NEWER schema is never restored
    // over it. See restoreNewestBackup.
    const restored = restoreNewestBackup(SCHEMA_VERSION)
    const error: AppError = appError('unrecoverable', 'Could not update the database', {
      safe: restored.ok
        ? 'Your library was restored from a backup taken moments ago.'
        : 'Your library was not modified.',
      cause,
    })
    // TODO(Slice 0): report to Sentry once the DSN is configured.
    cached = { ok: false, state: 'failed', error: error.message }
    return cached
  }
}

export function runMigrations(): Promise<MigrationStatus> {
  if (!inFlight) inFlight = performMigrations()
  return inFlight
}

/** Synchronous read of the last known status, for render. */
export function migrationStatus(): MigrationStatus {
  return cached
}

/** Hook form, for the root layout in Slice 1. */
export function useMigrationStatus(): MigrationStatus {
  const [status, setStatus] = useState<MigrationStatus>(cached)

  useEffect(() => {
    let alive = true
    runMigrations().then((s) => {
      if (alive) setStatus(s)
    })
    return () => {
      alive = false
    }
  }, [])

  return status
}
