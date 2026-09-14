/**
 * src/features/library/queries.ts
 *
 * All SQL for the Library list.
 *
 * ─── ONE QUERY FOR THE WHOLE LIST, NOT ONE PER ROW ───────────────────────────
 *
 * Every row shows progress, which lives in `sessions`. A per-row query would be 2000
 * queries for a 2000-book library, and the 60fps budget would be gone before FlashList
 * rendered anything. So the progress is aggregated in SQL, in the same statement that
 * reads the books, grouped by read.
 *
 * The aggregate itself lives in `db/progressAggregates.ts`, because book detail needs the
 * same rules and features may not import from one another. Device check 10 holds those SQL
 * rules equal to `contribution()` in domain/stats.ts.
 */

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'

import { getDb } from '@/db/client'
import { isCurrentRead } from '@/db/currentRead'
import { progressAggregates } from '@/db/progressAggregates'
import { books, reads, sessions, type ReadStatus } from '@/db/schema'
import type { UnixMs } from '@/lib/dates'
import { throwIfFault } from '@/lib/faults'

export interface LibraryRow {
  readonly readId: string
  readonly bookId: string
  readonly title: string
  readonly author: string | null
  readonly coverUrl: string | null
  readonly coverLocalPath: string | null
  readonly coverColor: string | null
  readonly status: ReadStatus
  readonly readNumber: number
  readonly pageCount: number | null
  readonly totalMinutes: number | null
  /** Furthest page reached in this read, or null when no page session says. */
  readonly page: number | null
  /** Furthest minute reached, for an audiobook. */
  readonly minute: number | null
  /** Pages read in this read, by the rules in domain/stats.ts. */
  readonly pagesRead: number
  /** Minutes read in this read, by the same rules: durations, or audiobook spans. */
  readonly minutesRead: number
  /** Sessions this read cannot count, so the UI can offer a fix rather than hide it. */
  readonly unusable: number
  readonly sessionCount: number
  readonly lastSessionAt: UnixMs | null
}

/**
 * The books on one status tab, newest reading first. One row per book: its current read.
 *
 * Ordered by the last session rather than by title: the book you read yesterday is the one
 * you want, and a list of 2000 alphabetical titles buries it. Books with no sessions sort
 * last, by title.
 */
export async function getLibraryRows(status: ReadStatus): Promise<LibraryRow[]> {
  throwIfFault('libraryQuery')
  const rows = await getDb()
    .select({
      readId: reads.id,
      bookId: books.id,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      coverLocalPath: books.coverLocalPath,
      coverColor: books.coverColor,
      status: reads.status,
      readNumber: reads.readNumber,
      pageCount: books.pageCount,
      totalMinutes: books.totalMinutes,
      ...progressAggregates,
    })
    .from(reads)
    .innerJoin(books, eq(reads.bookId, books.id))
    .leftJoin(sessions, and(eq(sessions.readId, reads.id), isNull(sessions.deletedAt)))
    // A book's tab is its CURRENT read's status. Without this, a re-read book appeared on
    // two tabs, or twice on one (db/currentRead.ts).
    .where(
      and(
        eq(reads.status, status),
        isNull(reads.deletedAt),
        isNull(books.deletedAt),
        isCurrentRead,
      ),
    )
    .groupBy(reads.id)
    .orderBy(
      sql`${progressAggregates.lastSessionAt} is null`,
      desc(progressAggregates.lastSessionAt),
      asc(books.title),
    )

  return rows
}

/**
 * Does the library hold any book at all?
 *
 * The difference between "you have no books" and "this tab is empty" is the difference
 * between an empty state that helps and one that lies: "No books yet" on the DNF tab of a
 * 2000-book library is wrong. One indexed row, not a count of two thousand.
 */
export async function hasAnyBooks(): Promise<boolean> {
  const rows = await getDb()
    .select({ one: sql<number>`1` })
    .from(books)
    .where(isNull(books.deletedAt))
    .limit(1)
  return rows.length > 0
}
