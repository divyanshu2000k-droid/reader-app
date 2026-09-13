/**
 * src/db/migrationPlan.ts
 *
 * Which migrations will run on this launch, decided by the SAME rule drizzle uses. Pure, so
 * it runs under `node --test`; `migrate.ts` does the I/O and calls it.
 *
 * WHY THIS EXISTS. The app used to back up the whole database on every cold start, pending
 * migration or not: a WAL checkpoint and a synchronous file copy on the JS thread before
 * the splash lifted, and a 3x free-space check that locked a reader on a nearly full phone
 * out of their library when there was no update to apply at all. A backup is only worth
 * its cost when something is about to change the schema.
 *
 * THE RULE IS DRIZZLE'S, NOT A COUNT. Drizzle's migrator reads the newest `created_at` in
 * `__drizzle_migrations` and applies every journal entry whose `when` is later
 * (`drizzle-orm/sqlite-core/dialect.js`, `migrate`). It never compares counts. So "pending"
 * here is computed from timestamps, exactly as drizzle will, and `migrate.ts` still asserts
 * afterwards that the count moved by the amount planned, so a divergence is reported rather
 * than silent.
 */

/** What the database on disk says about itself. Read by `appliedMigrations()` in client.ts. */
export interface AppliedMigrations {
  /** Rows in `__drizzle_migrations`. Also the schema version the data is at. */
  readonly count: number
  /** The newest `created_at` there, which is what drizzle compares against. Null when none. */
  readonly lastAppliedAt: number | null
}

export interface MigrationPlan {
  /** How many journal entries drizzle will apply on this launch. */
  readonly pending: number
  /**
   * Nothing has ever been applied: a fresh install. There are no tables and so no reader
   * data, so there is nothing a backup could protect.
   */
  readonly fresh: boolean
}

/**
 * Drizzle's rule for ONE journal entry: it applies when its `when` is later than the newest
 * applied migration. Exported so the node migration harness applies migrations by this rule
 * rather than by its own copy of it, which would drift from the one the app relies on.
 */
export function isPending(when: number, lastAppliedAt: number | null): boolean {
  return lastAppliedAt === null || when > lastAppliedAt
}

/** @param journalWhens each journal entry's `when`, in journal order. */
export function planMigrations(
  journalWhens: readonly number[],
  applied: AppliedMigrations,
): MigrationPlan {
  const last = applied.lastAppliedAt
  const pending = journalWhens.filter((w) => isPending(w, last)).length
  return { pending, fresh: applied.count === 0 }
}
