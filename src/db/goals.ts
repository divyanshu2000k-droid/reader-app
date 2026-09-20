/**
 * src/db/goals.ts
 *
 * THE YEARLY GOAL. All SQL for it, and the only place `goals` is written.
 *
 * In `db/` beside `currentRead.ts` and `noteCounts.ts`, not in a feature: Settings writes
 * the goal and Stats reads it, and features may not import from one another.
 *
 * ─── ONE LIVE GOAL PER YEAR, AND WHY THIS CODE CARES ─────────────────────────
 *
 * Migration 0003 added `idx_goals_year_live`, a UNIQUE index on `year` where `deleted_at IS
 * NULL`. The database will now refuse a second live goal for a year — which is the point,
 * because before 0003 two were representable and nothing stopped them.
 *
 * So `setGoal` UPDATES the live row when there is one and inserts only when there is not. A
 * blind insert would work on a fresh install, pass every check, and throw the first time a
 * reader changed their mind about a year they had already set. That shape — correct on empty
 * data, broken on real data — is the one this codebase keeps meeting, so it is written down
 * rather than discovered.
 *
 * Every write goes through `db/write.ts`, so each one queues for sync like any other.
 */

import { and, eq, isNull } from 'drizzle-orm'

import { getDb } from '@/db/client'
import { goals } from '@/db/schema'
import { softDelete, updateRow, writeRow } from '@/db/write'
import { newId } from '@/lib/ids'
import { ok, type Result } from '@/lib/result'

export interface Goal {
  readonly id: string
  readonly year: number
  readonly targetBooks: number | null
}

/** The live goal for a year, or null. */
export async function getGoal(year: number): Promise<Goal | null> {
  const rows = await getDb()
    .select({ id: goals.id, year: goals.year, targetBooks: goals.targetBooks })
    .from(goals)
    .where(and(eq(goals.year, year), isNull(goals.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

/** Every live goal, so Stats can show the right one for whichever year is selected. */
export async function getGoals(): Promise<Goal[]> {
  return getDb()
    .select({ id: goals.id, year: goals.year, targetBooks: goals.targetBooks })
    .from(goals)
    .where(isNull(goals.deletedAt))
}

/**
 * Set, change or clear the goal for a year.
 *
 * `null` clears it, by SOFT-deleting the row rather than writing a null target. The two are
 * not the same: a live row with a null target is a goal the reader set and then emptied,
 * which nothing else in the app knows how to show, and it would go on occupying the one live
 * slot that year is allowed. Clearing means there is no goal.
 */
export async function setGoal(year: number, target: number | null): Promise<Result<void>> {
  const existing = await getGoal(year)

  if (target === null) {
    // Nothing to clear is a success, not an error: the reader asked for no goal and there
    // is no goal.
    if (existing === null) return ok(undefined)
    const cleared = await softDelete('goals', existing.id)
    return cleared.ok ? ok(undefined) : cleared
  }

  if (existing !== null) {
    const changed = await updateRow('goals', existing.id, { targetBooks: target })
    return changed.ok ? ok(undefined) : changed
  }

  // The timestamps are DERIVED by the write path and a caller cannot supply them
  // (`RowFor`). That is the type making the `created_at`-rewritten-on-every-update bug
  // uncompilable rather than merely discouraged.
  return writeRow('goals', { id: newId(), year, targetBooks: target })
}
