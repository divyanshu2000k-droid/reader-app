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
import { useCallback, useEffect, useRef, useState } from 'react'

import { backupBeforeMigration, pruneBackups, restoreNewestBackup } from './backup'
import { appliedMigrationCount, getDb } from './client'
import migrations from './migrations/migrations'
import { appError, type AppError } from '@/lib/result'
import { reportUnrecoverable } from '@/lib/sentry'

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
    const error = appError('unrecoverable', 'Could not read your library', {
      safe: 'Nothing was changed. Your books are still on this phone.',
      cause,
    })
    reportUnrecoverable(error, { stage: 'appliedMigrationCount' })
    cached = { ok: false, state: 'failed', error: error.message }
    return cached
  }

  const backup = await backupBeforeMigration(dataVersion)
  if (!backup.ok) {
    // Fail closed. An app on an old schema still works; a half-migrated one may not.
    //
    // `reportUnrecoverable` logs the cause as well as sending it. Until a DSN exists the
    // log is the ONLY record: the reader sees "could not back up", and without it nobody
    // — including the next device pass — can find out why. Discovered the hard way: this
    // branch fired on a device and the cause had already been thrown away.
    reportUnrecoverable(backup.error, {
      stage: 'backupBeforeMigration',
      dataVersion: String(dataVersion),
      targetVersion: String(SCHEMA_VERSION),
    })
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
    // The version PAIR and the restore outcome, not just the error. Without them the
    // Sentry issue is as uninformative as the console line it replaced: "migration
    // failed" cannot distinguish a v1→v2 failure that rolled back cleanly from a v2→v3
    // failure that left the library untouched, and those need different responses.
    reportUnrecoverable(error, {
      stage: 'migrate',
      dataVersion: String(dataVersion),
      targetVersion: String(SCHEMA_VERSION),
      restored: String(restored.ok),
    })
    cached = { ok: false, state: 'failed', error: error.message }
    return cached
  }
}

export function runMigrations(): Promise<MigrationStatus> {
  if (!inFlight) inFlight = performMigrations()
  return inFlight
}

/**
 * Try again after a failure.
 *
 * `runMigrations` memoises its promise for the life of the process, which is right for
 * the ordinary case — two components mounting in the same tick must not run two
 * concurrent migrations — and wrong after a failure: there was no way to try again
 * without killing the app, and the failure screen's only honest advice was "force stop
 * it". A retry is genuinely meaningful here because the restore path CLOSES the database
 * (see `restoreNewestBackup`), so the next attempt reopens from whatever is on disk.
 *
 * Only ever clears the memo on a FAILED status. Re-running a successful migration would
 * take a second backup and re-enter the migrator for no reason, and calling this while
 * one is still in flight would start a second concurrent migration against one database —
 * the exact thing the memo exists to prevent.
 */
export function retryMigrations(): Promise<MigrationStatus> {
  if (cached.state === 'failed') {
    inFlight = null
    cached = { state: 'pending' }
  }
  return runMigrations()
}

/** Synchronous read of the last known status, for render. */
export function migrationStatus(): MigrationStatus {
  return cached
}

export interface MigrationState {
  readonly status: MigrationStatus
  /** True while a retry is running, so the button can show its busy label. */
  readonly retrying: boolean
  /** Try again after a failure. No-op unless the status is `failed`. */
  readonly retry: () => void
}

/**
 * Hook form, for the launch gates.
 *
 * Exposes `retry` because a failed migration is otherwise a dead end: the memo in
 * `runMigrations` survives for the life of the process, so the only way out was to kill
 * the app. `06-CONVENTIONS.md` requires an unrecoverable error to offer a restart, and
 * "force stop the app yourself" is not one.
 */
export function useMigrationStatus(): MigrationState {
  const [status, setStatus] = useState<MigrationStatus>(cached)
  const [retrying, setRetrying] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    runMigrations().then((s) => {
      if (alive.current) setStatus(s)
    })
    return () => {
      alive.current = false
    }
  }, [])

  const retry = useCallback(() => {
    // Guard on the CURRENT cached status rather than the rendered one: two taps in the
    // same frame would otherwise both pass the check and clear the memo twice, starting
    // two concurrent migrations against one database.
    if (migrationStatus().state !== 'failed') return
    // The rendered status STAYS 'failed' until the retry resolves, and `retrying` carries
    // the in-progress state. It used to be reset to 'pending' here, which the launch gates
    // read as "still booting" and render as nothing — the splash is long gone by then — so
    // Try again blanked the screen for the length of the retry instead of showing its busy
    // label. Pinned in src/features/launch/__tests__/gateOrder.test.ts.
    setRetrying(true)
    retryMigrations()
      .then((s) => {
        if (alive.current) setStatus(s)
      })
      .finally(() => {
        if (alive.current) setRetrying(false)
      })
  }, [])

  return { status, retrying, retry }
}
