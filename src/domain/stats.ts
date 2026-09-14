/**
 * src/domain/stats.ts
 *
 * Aggregations. The one rule that governs this entire file:
 *
 *   PAGES AND MINUTES ARE NEVER ADDED TOGETHER.
 *
 * They are separate fields on every return type here, and there is deliberately no
 * function that combines them. Audiobooks inflating page counts is the largest unmet
 * complaint in the category, and the type system is where we make it impossible rather
 * than merely discouraged.
 */

import { sessionAmount, type ProgressSession } from './progress'
import { addDays, yearOfLocalDay, type LocalDay } from '@/lib/dates'

/**
 * The three numbers, always separate. Books is counted elsewhere, from `reads`, because
 * it comes from a different table.
 */
export interface ReadingTotals {
  /** Pages read: position spans of page-based sessions. */
  readonly pages: number
  /**
   * Time read, in minutes: the duration of every timed session, plus the position span of
   * an audiobook session logged by hand, which is the only measure it has.
   */
  readonly minutes: number
  /**
   * Sessions carrying something the reader can fix: positions given but not countable (one
   * end missing, or backwards), or no measure at all.
   *
   * Carried alongside the totals rather than dropped, because a total that quietly
   * excludes rows is a number the reader cannot reconcile with their own session list.
   * A non-zero value here is the UI's cue to offer a fix, never to hide the total.
   */
  readonly unusable: number
}

export const EMPTY_TOTALS: ReadingTotals = { pages: 0, minutes: 0, unusable: 0 }

/** What one session adds to the totals. Two quantities, never one. */
export interface SessionContribution {
  readonly pages: number
  readonly minutes: number
  readonly unusable: boolean
}

/**
 * HOW A SESSION COUNTS. Product decision, DECISIONS.md 2026-09-10.
 *
 *   - A page-based session counts its positions towards pages.
 *   - A timed session counts its duration towards time, whatever its format.
 *   - An audiobook session logged by hand has no duration, so its minute span is its time.
 *   - A timed audiobook session counts its DURATION, not its span as well: time is never
 *     counted twice, and at 1.5x the span is the book's minutes, not the reader's.
 *   - A recovered session has a duration and no positions. It counts fully in time, not at
 *     all in pages, and is NOT unusable: a real person really did read for that time. It
 *     used to land in `unusable`, because the only measure this file knew was positions.
 *
 * Pages and minutes are separate fields and are never added together.
 */
export function contribution(s: ProgressSession): SessionContribution {
  const timed =
    s.durationSeconds !== null && Number.isFinite(s.durationSeconds) && s.durationSeconds >= 0
      ? s.durationSeconds / 60
      : null
  const span = sessionAmount(s)
  const brokenPositions = (s.fromPosition !== null || s.toPosition !== null) && span === null

  if (s.format === 'pages') {
    return {
      pages: span ?? 0,
      minutes: timed ?? 0,
      unusable: brokenPositions || (span === null && timed === null),
    }
  }
  const minutes = timed ?? span
  return { pages: 0, minutes: minutes ?? 0, unusable: brokenPositions || minutes === null }
}

export function totals(sessions: readonly ProgressSession[]): ReadingTotals {
  let pages = 0
  let minutes = 0
  let unusable = 0
  for (const s of sessions) {
    const c = contribution(s)
    pages += c.pages
    minutes += c.minutes
    if (c.unusable) unusable += 1
  }
  return { pages, minutes, unusable }
}

/** Hours, for display only. The stored and summed unit is always minutes. */
export function hoursFrom(minutes: number): number {
  return minutes / 60
}

export interface DayTotals extends ReadingTotals {
  readonly day: LocalDay
}

/**
 * Daily pace, bucketed by `localDay`.
 *
 * This groups on the stored local day, never on `date(occurred_at)`. That is what makes
 * the chart correct for a reader in IST who reads at 4am, and it is the reason the
 * column exists at all.
 *
 * Returns only days that have sessions. The caller fills gaps, because a chart wants
 * zeroes and a list does not.
 */
export function dailyTotals(sessions: readonly ProgressSession[]): DayTotals[] {
  const byDay = new Map<LocalDay, ProgressSession[]>()
  for (const s of sessions) {
    const bucket = byDay.get(s.localDay) ?? []
    bucket.push(s)
    byDay.set(s.localDay, bucket)
  }
  // Delegates to `totals` rather than re-implementing the sum, so the unusable-session
  // rule cannot be right in one function and wrong in the other.
  return [...byDay.entries()]
    .map(([day, rows]) => ({ day, ...totals(rows) }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

/**
 * The last `count` days ending on `endDay`, oldest first, with a zero for every day that has
 * no sessions. A chart needs its gaps drawn: a week with two reading days is five empty bars,
 * not a two-bar chart that looks like a good week.
 */
export function lastDays(
  days: readonly DayTotals[],
  endDay: LocalDay,
  count: number,
): DayTotals[] {
  const byDay = new Map(days.map((d) => [d.day, d]))
  const out: DayTotals[] = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = addDays(endDay, -i)
    out.push(byDay.get(day) ?? { day, ...EMPTY_TOTALS })
  }
  return out
}

/** Every distinct day that has at least one session. Feeds the streak calculation. */
export function activeDays(sessions: readonly ProgressSession[]): LocalDay[] {
  return [...new Set(sessions.map((s) => s.localDay))].sort()
}

/** Totals for one calendar year, bucketed by the local day rather than by UTC. */
export function totalsForYear(
  sessions: readonly ProgressSession[],
  year: number,
): ReadingTotals {
  return totals(sessions.filter((s) => yearOfLocalDay(s.localDay) === year))
}

/** Years that have any activity, newest first. Drives the year switcher on Stats. */
export function yearsWithActivity(sessions: readonly ProgressSession[]): number[] {
  return [...new Set(sessions.map((s) => yearOfLocalDay(s.localDay)))].sort((a, b) => b - a)
}
