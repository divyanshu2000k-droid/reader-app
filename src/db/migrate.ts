/**
 * src/db/migrate.ts
 *
 * Runs Drizzle migrations at startup, behind the backup contract.
 *
 * The order is not negotiable:
 *   1. Decide what is pending, by drizzle's own rule (migrationPlan.ts).
 *   2. Nothing pending: migrate() anyway (it is a no-op that stays the authority), no
 *      backup, no free-space check, no file copy. This is almost every launch.
 *   3. Something pending on a database that has data: back up. If the backup fails, DO
 *      NOT MIGRATE. Fail closed.
 *   4. Migrate. On success, prune old backups. On failure, VERIFY the rollback.
 *
 * ─── WHY A FAILED MIGRATION NO LONGER RESTORES A FILE ────────────────────────
 *
 * Drizzle's migrator runs every pending migration inside ONE transaction and issues
 * ROLLBACK if any statement throws (`drizzle-orm/sqlite-core/dialect.js`, `migrate`).
 * SQLite DDL is transactional. So after a failure the database is already exactly as it
 * was, and the old response — close the connection, delete the live file, move a copy
 * into place — was file surgery on the startup path that could only ADD risk: it is the
 * one step in this module that can leave a reader with no database at all.
 *
 * Now the rollback is checked rather than assumed: if `__drizzle_migrations` still holds
 * the count it held before, nothing was applied and the files are left alone. Only if that
 * check fails, or cannot be made, is the backup taken moments earlier put back.
 *
 * One consequence for every future migration: `PRAGMA foreign_keys=OFF`, which
 * drizzle-kit emits around a table rebuild, is a NO-OP inside a transaction. See
 * docs/03-DATA-MODEL.md, Migrations.
 */

import { migrate } from 'drizzle-orm/expo-sqlite/migrator'
import { useCallback, useEffect, useRef, useState } from 'react'

import { backupBeforeMigration, pruneBackups, restoreBackup, type BackupInfo } from './backup'
import { appliedMigrations, closeDatabase, getDb } from './client'
import { planMigrations, type AppliedMigrations, type MigrationPlan } from './migrationPlan'
import migrations from './migrations/migrations'
import { appError, type AppError } from '@/lib/result'
import { reportUnrecoverable } from '@/lib/sentry'

/**
 * What the reader is shown. The `safe` line is carried through, not just the message: it
 * is where "free up 40 MB" lives. It used to be dropped here, so a reader with a full
 * phone was told "this usually clears on a second try" and could try forever.
 */
export type MigrationFailure = Pick<AppError, 'message' | 'safe'>

export type MigrationStatus =
  | { readonly state: 'pending' }
  | { readonly ok: true; readonly state: 'done'; readonly version: number }
  | { readonly ok: false; readonly state: 'failed'; readonly error: MigrationFailure }

/** The schema version this BUILD targets: how many migrations it knows about. */
export const SCHEMA_VERSION = migrations.journal.entries.length

/** Each journal entry's `when`: what drizzle compares against the database. */
const JOURNAL_WHENS: readonly number[] = migrations.journal.entries.map((e) => e.when)

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

function fail(error: AppError, context: Record<string, string>): MigrationStatus {
  // `reportUnrecoverable` logs the cause as well as sending it. Until a DSN exists the log
  // is the ONLY record of why: discovered the hard way, when this branch fired on a device
  // and the cause had already been thrown away.
  reportUnrecoverable(error, context)
  cached = { ok: false, state: 'failed', error: { message: error.message, safe: error.safe } }
  return cached
}

/** The applied count, or null when it cannot be read. For verification only. */
function appliedCountOrNull(): number | null {
  try {
    return appliedMigrations().count
  } catch {
    return null
  }
}

async function performMigrations(): Promise<MigrationStatus> {
  // Fails closed with a real message rather than guessing 0 and backing up a full
  // database under a name that says it is empty. See `appliedMigrations` in client.ts.
  let applied: AppliedMigrations
  try {
    applied = appliedMigrations()
  } catch (cause) {
    return fail(
      appError('unrecoverable', 'Could not read your library', {
        safe: 'Nothing was changed. Your books are still on this phone.',
        cause,
      }),
      { stage: 'appliedMigrations' },
    )
  }

  const plan = planMigrations(JOURNAL_WHENS, applied)
  // Named for the version of the data being copied, NOT the version being migrated to: a
  // backup stamped with the target version once made v1 data look like v2 and defeated
  // the rule in restoreNewestBackup about never restoring what this build cannot read.
  const dataVersion = applied.count
  const versions = {
    dataVersion: String(dataVersion),
    targetVersion: String(SCHEMA_VERSION),
    pending: String(plan.pending),
  }

  // ONLY when something is about to change the schema of a database that holds data. A
  // fresh install has no tables, so there is nothing a backup could protect.
  let backup: BackupInfo | null = null
  if (plan.pending > 0 && !plan.fresh) {
    const made = await backupBeforeMigration(dataVersion)
    // Fail closed. An app on an old schema still works; a half-migrated one may not.
    if (!made.ok) return fail(made.error, { stage: 'backupBeforeMigration', ...versions })
    if (made.value.kind === 'made') backup = made.value.backup
  }

  try {
    await migrate(getDb(), migrations)
  } catch (cause) {
    return failedMigration(cause, dataVersion, plan, backup, versions)
  }

  // Drizzle is the authority on what it applied. If it disagrees with the plan, a
  // migration may have run with no backup behind it: the run itself was atomic, so the
  // reader is not stuck, but it must not be silent.
  const after = appliedCountOrNull()
  if (after !== dataVersion + plan.pending) {
    reportUnrecoverable(
      appError('unrecoverable', 'Applied migrations did not match the plan', {}),
      { stage: 'verifyPlan', ...versions, after: String(after) },
    )
  }

  if (backup) {
    // Housekeeping, after success and never before. A listing that throws here must not
    // turn a successful migration into a reported failure; it used to sit inside the
    // migration's try, where it would have been treated as one.
    try {
      pruneBackups()
    } catch (cause) {
      console.warn('[migrate] could not prune old backups:', cause)
    }
  }

  cached = { ok: true, state: 'done', version: SCHEMA_VERSION }
  return cached
}

function failedMigration(
  cause: unknown,
  dataVersion: number,
  plan: MigrationPlan,
  backup: BackupInfo | null,
  versions: Record<string, string>,
): MigrationStatus {
  // Verified, not trusted: the count must be exactly what it was before the attempt.
  const now = appliedCountOrNull()
  const rolledBack = now === dataVersion

  let restore: 'not needed' | 'restored' | 'failed' | 'no backup' = 'not needed'
  if (rolledBack) {
    // A retry then starts from a fresh connection rather than one that just failed.
    closeDatabase()
  } else if (backup) {
    restore = restoreBackup(backup).ok ? 'restored' : 'failed'
  } else {
    restore = 'no backup'
  }

  const safe = rolledBack
    ? 'The update was undone, so your library is exactly as it was.'
    : restore === 'restored'
      ? 'Your library was put back from a copy taken moments before the update.'
      : plan.fresh
        ? 'This is a new install, so nothing of yours was lost.'
        : 'A copy of your library from before the update is still on this phone.'

  // The version pair and what happened next, not just the error: "migration failed"
  // cannot tell a clean rollback from a restore, and those need different responses.
  return fail(appError('unrecoverable', 'Could not update your library', { safe, cause }), {
    stage: 'migrate',
    ...versions,
    rolledBack: String(rolledBack),
    countAfterFailure: String(now),
    restore,
  })
}

export function runMigrations(): Promise<MigrationStatus> {
  // Never rejects. A rejection here would leave `useMigrationStatus` waiting forever and
  // the reader looking at a blank screen once the splash failsafe fires.
  inFlight ??= performMigrations().catch((cause: unknown) =>
    fail(
      appError('unrecoverable', 'Could not open your library', {
        safe: 'Nothing was changed. Your books are still on this phone.',
        cause,
      }),
      { stage: 'unexpected' },
    ),
  )
  return inFlight
}

/**
 * Try again after a failure.
 *
 * `runMigrations` memoises its promise for the life of the process, which is right for
 * the ordinary case — two components mounting in the same tick must not run two
 * concurrent migrations — and wrong after a failure: there was no way to try again
 * without killing the app. A retry reopens the connection (the failure path closes it)
 * and re-reads the plan, so a reader who has freed up space genuinely gets through.
 *
 * Only ever clears the memo on a FAILED status. Re-running a successful migration would
 * re-enter the migrator for no reason, and calling this while one is still in flight
 * would start a second concurrent migration against one database — the exact thing the
 * memo exists to prevent.
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
    void runMigrations().then((s) => {
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
    void retryMigrations()
      .then((s) => {
        if (alive.current) setStatus(s)
      })
      .finally(() => {
        if (alive.current) setRetrying(false)
      })
  }, [])

  return { status, retrying, retry }
}
