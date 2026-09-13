/**
 * src/domain/progressDisplay.ts
 *
 * WHAT A READ SAYS ABOUT PROGRESS, on the Library row and on book detail alike. Pure, so the awkward cases are asserted under
 * `node --test` instead of being eyeballed on one seeded book.
 *
 * The awkward cases are the common ones:
 *   - **A quarter of print books have no page count.** There is no honest percentage, so
 *     the row shows pages read and NO bar. A bar at 0% would say "you have read nothing".
 *   - **An audiobook has no pages at all.** It shows time, and its bar is minutes listened
 *     against the book's length.
 *   - **A book with no sessions says nothing.** Not "0%", which reads as failure on a book
 *     the reader has not started.
 *   - **A read with sessions that cannot be counted** says so, so the reader can find them.
 */

import { percentComplete } from './progress'
import { formatDuration } from '@/lib/dates'

/** What a read's progress aggregate provides: see db/progressAggregates.ts. */
export interface RowProgress {
  readonly pageCount: number | null
  readonly totalMinutes: number | null
  readonly page: number | null
  readonly minute: number | null
  readonly pagesRead: number
  readonly minutesRead: number
  readonly unusable: number
}

export interface RowDisplay {
  /** 0 to 1 for the bar, or null when there is no honest fraction to draw. */
  readonly fraction: number | null
  /** The short label beside the bar, or null when there is nothing to say yet. */
  readonly label: string | null
  /** True when this read has sessions the reader should fix. */
  readonly needsAttention: boolean
}

/**
 * An audiobook: one with a recorded length in minutes, or only minute positions.
 *
 * THE one definition. The Library row, book detail's hero and its progress card each used to
 * test `totalMinutes !== null` for themselves, so an audiobook with no recorded length got a
 * time label here and no "audio" marker or headline there.
 */
export function isAudiobook(
  row: Pick<RowProgress, 'totalMinutes' | 'page' | 'minute'>,
): boolean {
  return row.totalMinutes !== null || (row.minute !== null && row.page === null)
}

export function progressDisplay(row: RowProgress): RowDisplay {
  const needsAttention = row.unusable > 0

  if (isAudiobook(row)) {
    return {
      fraction:
        row.minute === null ? null : percentComplete(row.minute, row.totalMinutes ?? null),
      label: row.minutesRead > 0 ? formatDuration(Math.round(row.minutesRead * 60)) : null,
      needsAttention,
    }
  }

  const fraction = row.page === null ? null : percentComplete(row.page, row.pageCount)
  if (fraction !== null) {
    return { fraction, label: `${Math.round(fraction * 100)}%`, needsAttention }
  }
  // No page count, or nothing read yet. Pages read is still a fact worth showing.
  return {
    fraction: null,
    label: row.pagesRead > 0 ? `${row.pagesRead} pages` : null,
    needsAttention,
  }
}
