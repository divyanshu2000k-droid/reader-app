/**
 * src/db/migrate.ts
 *
 * Runs Drizzle migrations at startup, behind the backup contract.
 *
 * The order is not negotiable:
 *   1. Back up. If the backup fails, DO NOT MIGRATE. Fail closed.
 *   2. Migrate.
 *   3. On success, prune old backups. On failure, restore the newest and report.
 *
 * `useMigrations` from drizzle-orm/expo-sqlite is the hook-based alternative; this is
 * the imperative form so the backup can wrap it.
 */

import { migrate } from 'drizzle-orm/expo-sqlite/migrator'
import { useEffect, useState } from 'react'

import { backupBeforeMigration, pruneBackups, restoreNewestBackup } from './backup'
import { db } from './client'
import migrations from './migrations/migrations'
import { appError, type AppError } from '@/lib/result'

export type MigrationStatus =
  | { readonly state: 'pending' }
  | { readonly ok: true; readonly state: 'done'; readonly version: number }
  | { readonly ok: false; readonly state: 'failed'; readonly error: string }

/** Bumped whenever a migration is added. Names the backup file. */
export const SCHEMA_VERSION = migrations.journal.entries.length

let cached: MigrationStatus = { state: 'pending' }

export async function runMigrations(): Promise<MigrationStatus> {
  const backup = await backupBeforeMigration(SCHEMA_VERSION)
  if (!backup.ok) {
    // Fail closed. An app on an old schema still works.
    cached = { ok: false, state: 'failed', error: backup.error.message }
    return cached
  }

  try {
    await migrate(db, migrations)
    pruneBackups()
    cached = { ok: true, state: 'done', version: SCHEMA_VERSION }
    return cached
  } catch (cause) {
    const restored = restoreNewestBackup()
    const error: AppError = appError(
      'unrecoverable',
      'Could not update the database',
      {
        safe: restored.ok
          ? 'Your library was restored from a backup taken moments ago.'
          : 'Your library was not modified.',
        cause,
      },
    )
    // TODO(Slice 0): report to Sentry once the DSN is configured.
    cached = { ok: false, state: 'failed', error: error.message }
    return cached
  }
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
    if (cached.state !== 'pending') return
    runMigrations().then((s) => {
      if (alive) setStatus(s)
    })
    return () => {
      alive = false
    }
  }, [])
  return status
}
