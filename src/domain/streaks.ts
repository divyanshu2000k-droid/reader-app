/**
 * src/domain/streaks.ts
 *
 * Streak and goal calculation.
 *
 * Every function here takes `LocalDay` values, never timestamps. A streak computed from
 * UTC days breaks for any reader who reads late at night or lives east of Greenwich,
 * which is most of them. See DECISIONS.md, 2026-09-03.
 */

import { addDays, daysBetween, todayLocalDay, type LocalDay } from '@/lib/dates'

/**
 * Consecutive days ending today or yesterday, counting back.
 *
 * WHEN EXACTLY A STREAK BREAKS
 *
 * Let D be the reader's most recent day with a session. The streak is alive when today
 * is D or D+1, and is zero from D+2 onward. So it breaks at **local midnight beginning
 * D+2** — that is, at the end of one full calendar day with no session.
 *
 *   last session Tue, today Tue   → alive  (read today)
 *   last session Tue, today Wed   → alive  (grace day: not read YET)
 *   last session Tue, today Thu   → BROKEN (Wednesday passed with nothing)
 *
 * No session yesterday and none today is broken, not alive. There is exactly one grace
 * day, never two.
 *
 * Every boundary here is a `LocalDay`, so the midnight in question is the reader's local
 * midnight, derived from `sessions.local_day`. It is never UTC midnight: a reader in IST
 * finishing at 23:00 would otherwise have that session filed under the next UTC day and
 * be credited for a day they did not read, and a reader in Chicago reading at 19:00
 * would lose the day they did.
 *
 * The grace day exists because ending the streak at the midnight after the last session
 * punishes a reader for the hour they happen to open the app, and this app never nags.
 */
export function currentStreak(
  days: readonly LocalDay[],
  today: LocalDay = todayLocalDay(),
): number {
  if (days.length === 0) return 0
  const set = new Set(days)

  let cursor: LocalDay
  if (set.has(today)) cursor = today
  else if (set.has(addDays(today, -1))) cursor = addDays(today, -1)
  else return 0

  let streak = 0
  while (set.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** The longest run of consecutive days in the whole history. */
export function longestStreak(days: readonly LocalDay[]): number {
  if (days.length === 0) return 0
  const sorted = [...new Set(days)].sort()

  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    if (prev === undefined || curr === undefined) continue
    run = daysBetween(prev, curr) === 1 ? run + 1 : 1
    if (run > best) best = run
  }
  return best
}

export interface GoalProgress {
  readonly target: number
  readonly finished: number
  /** 0 to 1, clamped. */
  readonly fraction: number
  /** True once the target is met. Never shown as a failure before year end. */
  readonly met: boolean
  /**
   * True when the target was lowered below what has already been read. The UI treats
   * this as met rather than as an error: a reader adjusting their goal downward has not
   * done anything wrong. Spec gap resolved here, see DECISIONS.md.
   */
  readonly targetBelowProgress: boolean
}

export function goalProgress(target: number | null, finished: number): GoalProgress | null {
  if (target === null || target <= 0) return null
  return {
    target,
    finished,
    fraction: Math.min(finished / target, 1),
    met: finished >= target,
    targetBelowProgress: finished > target,
  }
}
