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
import { appliedMigrationCount, getDb } from './client'
import migrations from './migrations/migrations'
import { appError, type AppError } from '@/lib/result'

export type MigrationStatus =
  | { readonly state: 'pending' }
  | { readonly ok: true; readonly state: 'done'; readonly version: number }
  | { readonly ok: false; readonly state: 'failed'; readonly error: string }

/** The schema version this BUILD targets: how many migrations it knows about. */
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

/**
 * The schema version the database on disk is ALREADY at, i.e. how many migrations have
 * been applied to it.
 *
 * This is what names the backup, and the distinction is not pedantic. The backup used to
 * be stamped with `SCHEMA_VERSION` — the version being migrated TO — so a copy of a v1
 * database taken moments before a v1→v2 migration was written to disk as
 * `reader-2-….db`. The device pass caught it: after a failed migration the backups
 * directory held `reader-2-*.db` files whose contents were v1.
 *
 * That mislabelling silently defeats the rule in `restoreNewestBackup`, which decides
 * what it can safely read from exactly this number. A v1 build would refuse a backup it
 * could read perfectly well, and the name would describe an intention rather than a fact.
 *
 * The read itself lives in `client.ts`: it must finalize its statement, or the WAL
 * checkpoint in the very next step cannot run. See `appliedMigrationCount`.
 */
async function performMigrations(): Promise<MigrationStatus> {
  // Named for the version of the data being copied, NOT the version being migrated to.
  //
  // `appliedMigrationCount` now throws rather than guessing 0 when it cannot read the
  // table, so this fails closed with a real message instead of backing up a full
  // database under a name that says it is empty. Letting it propagate is not an option:
  // `runMigrations()`'s promise would reject, `useMigrationStatus` would never resolve,
  // and the app would sit on "opening database" forever.
  let dataVersion: number
  try {
    dataVersion = appliedMigrationCount()
  } catch (cause) {
    console.error('[migrate] could not read the schema version:', cause)
    cached = {
      ok: false,
      state: 'failed',
      error: 'Could not read your library',
    }
    return cached
  }

  const backup = await backupBeforeMigration(dataVersion)
  if (!backup.ok) {
    // Fail closed. An app on an old schema still works; a half-migrated one may not.
    //
    // The cause is logged because until Sentry lands this is the ONLY place it exists:
    // the reader sees "could not back up", and without this line nobody — including the
    // next device pass — can find out why. Discovered the hard way: this branch fired on
    // a device and the cause had already been thrown away.
    console.error('[migrate] backup failed:', backup.error.message, backup.error.cause)
    cached = { ok: false, state: 'failed', error: backup.error.message }
    return cached
  }

  try {
    await migrate(getDb(), migrations)
    pruneBackups()
    cached = { ok: true, state: 'done', version: SCHEMA_VERSION }
    return cached
  } catch (cause) {
    console.error('[migrate] migration failed:', cause)
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
