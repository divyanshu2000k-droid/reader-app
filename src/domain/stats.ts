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
import { yearOfLocalDay, type LocalDay } from '@/lib/dates'

/**
 * The three numbers, always separate. Books is counted elsewhere, from `reads`, because
 * it comes from a different table.
 */
export interface ReadingTotals {
  readonly pages: number
  readonly minutes: number
}

export const EMPTY_TOTALS: ReadingTotals = { pages: 0, minutes: 0 }

export function totals(sessions: readonly ProgressSession[]): ReadingTotals {
  let pages = 0
  let minutes = 0
  for (const s of sessions) {
    const amount = sessionAmount(s)
    if (s.format === 'pages') pages += amount
    else minutes += amount
  }
  return { pages, minutes }
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
  const byDay = new Map<LocalDay, { pages: number; minutes: number }>()
  for (const s of sessions) {
    const bucket = byDay.get(s.localDay) ?? { pages: 0, minutes: 0 }
    const amount = sessionAmount(s)
    if (s.format === 'pages') bucket.pages += amount
    else bucket.minutes += amount
    byDay.set(s.localDay, bucket)
  }
  return [...byDay.entries()]
    .map(([day, t]) => ({ day, pages: t.pages, minutes: t.minutes }))
    .sort((a, b) => a.day.localeCompare(b.day))
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
