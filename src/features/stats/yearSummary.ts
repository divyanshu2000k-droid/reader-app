/**
 * src/features/stats/yearSummary.ts
 *
 * THE THREE NUMBERS, for one year. Pure, so they are asserted rather than eyeballed.
 *
 * ─── THREE NUMBERS, NEVER TWO AND NEVER ONE ──────────────────────────────────
 *
 * Books, pages and hours are separate fields and there is deliberately no function here that
 * combines them. `domain/stats.ts` explains why at length: audiobooks inflating page counts
 * is the largest unmet complaint in the category, and a "total" that quietly adds a
 * nine-hour audiobook to a page count is the exact thing readers review competitors badly
 * for. The type is where that is made impossible rather than merely discouraged.
 *
 * ─── THE THREE COME FROM TWO PLACES, AND THEY MUST AGREE ─────────────────────
 *
 * Pages and hours are session facts, from `contribution()`. **Books is a `reads` fact**, from
 * `finishedInYear()` — a book counts in the year it was FINISHED, not the year it was read
 * in. A book started in December and finished in January counts once, in January, and its
 * December pages count in December. That is not an inconsistency to be smoothed over: they
 * are answers to two different questions, and the screen labels them as such.
 *
 * Both are computed from one load of each table by `StatsScreen`, so the number above the
 * genre chart and the chart itself cannot disagree.
 */

import { finishedInYear, type FinishedRead } from '@/domain/finishes'
import { hoursFrom, totalsForYear } from '@/domain/stats'
import type { ProgressSession } from '@/domain/progress'
import { localYearOf, yearOfLocalDay } from '@/lib/dates'

export interface YearSummary {
  readonly year: number
  /** Books FINISHED in this year. A `reads` fact, not a session fact. */
  readonly books: number
  /** Pages read in this year, from page-based sessions only. */
  readonly pages: number
  /** Hours read in this year, rounded for display; `minutes` is the exact figure. */
  readonly hours: number
  readonly minutes: number
  /**
   * Sessions in this year carrying something the reader could fix.
   *
   * Surfaced, never used to silently shrink a total: a number the reader cannot reconcile
   * with their own session list is worse than a number with a caveat beside it.
   */
  readonly unusable: number
}

export function yearSummary(
  sessions: readonly ProgressSession[],
  finished: readonly FinishedRead[],
  year: number,
): YearSummary {
  const totals = totalsForYear(sessions, year)
  return {
    year,
    books: finishedInYear(finished, year),
    pages: totals.pages,
    hours: hoursFrom(totals.minutes),
    minutes: totals.minutes,
    unusable: totals.unusable,
  }
}

/**
 * Every year the reader has anything to show, newest first.
 *
 * Both sources, unioned: a year in which a book was finished but nothing was logged is still
 * a year with something to show, and so is a year of reading that finished nothing. Taking
 * only the sessions would make the year switcher disagree with the books number it sits
 * above.
 *
 * The current year is always offered, even when it is empty — a reader opening Stats in
 * January must not be shown last year as though the new one had not started.
 */
export function yearsToOffer(
  sessions: readonly ProgressSession[],
  finished: readonly FinishedRead[],
  thisYear: number,
): number[] {
  const years = new Set<number>([thisYear])
  for (const session of sessions) years.add(yearOfLocalDay(session.localDay))
  for (const read of finished) {
    const at = read.finishedAt ?? read.lastSessionAt
    // A finished read with no date at all counts in no year, rather than quietly in this one.
    if (at !== null) years.add(localYearOf(at))
  }
  return [...years].sort((a, b) => b - a)
}

/** True when there is nothing at all to show for a year: the cue for the empty state. */
export function isEmptyYear(summary: YearSummary): boolean {
  return summary.books === 0 && summary.pages === 0 && summary.minutes === 0
}
