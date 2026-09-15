/**
 * src/domain/finishes.ts
 *
 * When a read was finished, and which year it counts in. Pure.
 *
 * Several screens need both answers: book detail's earlier reads, library search's badge, the
 * finish flow's "your 31st book this year", and Stats in Slice 7. Each used to write
 * `finishedAt ?? lastSessionAt` inline. Two copies of a rule is how this codebase has been
 * bitten, so there is one.
 *
 * ─── THE RULE ────────────────────────────────────────────────────────────────
 *
 * - **A finished read's date is the reader's `finished_at` when set**, and otherwise its last
 *   session (03-DATA-MODEL, the override rule).
 * - **A finished read with neither has no date.** It counts as finished and in no year. A book
 *   added as "I already finished it" with no date must not land in this year's count: the app
 *   never records a number on the reader's behalf that it does not know (CLAUDE.md, item 9).
 * - **The year is the device's local year**, never UTC. A New Year's Eve finish at 11 pm in
 *   Chicago is 05:00 UTC on the 1st and belongs to the old year (`localYearOf`).
 * - **Only `finished` counts.** A DNF read's pages count toward totals; the book does not
 *   count as read.
 */

import { localYearOf, type UnixMs } from '@/lib/dates'
import type { ReadStatus } from '@/db/schema'

export interface FinishSource {
  readonly status: ReadStatus
  /** The reader's own date. Null means derive it from the sessions. */
  readonly finishedAt: UnixMs | null
  readonly lastSessionAt: UnixMs | null
}

/** When this read was finished, or null when it is not finished or no date is known. */
export function effectiveFinishedAt(read: FinishSource): UnixMs | null {
  if (read.status !== 'finished') return null
  return read.finishedAt ?? read.lastSessionAt
}

export interface FinishedRead extends FinishSource {
  readonly readId: string
}

/**
 * How many reads were finished in `year`, not counting `excludeReadId`.
 *
 * The finish flow excludes the read being finished and adds one, so the count follows the date
 * the reader is choosing rather than the one already stored.
 */
export function finishedInYear(
  finished: readonly FinishedRead[],
  year: number,
  excludeReadId: string | null = null,
): number {
  let count = 0
  for (const read of finished) {
    if (read.readId === excludeReadId) continue
    const at = effectiveFinishedAt(read)
    if (at !== null && localYearOf(at) === year) count += 1
  }
  return count
}

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "112th". */
export function ordinal(n: number): string {
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
