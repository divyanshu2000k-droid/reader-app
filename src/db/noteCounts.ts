/**
 * src/db/noteCounts.ts
 *
 * HOW MANY NOTES AND QUOTES A BOOK HAS.
 *
 * In `db/` beside the schema because it is shared SQL, exactly like `currentRead.ts`: book
 * detail's actions sheet shows the count on its Notes row, the notes list shows it in its
 * header, and features may not import from one another (06-CONVENTIONS). One definition, so
 * the two can never disagree about what a book has.
 *
 * Counted by type in SQL rather than by fetching the rows and counting them here: a heavily
 * annotated book has hundreds of notes, and the actions sheet needs two numbers, not the
 * words.
 */

import { and, count, eq, isNull } from 'drizzle-orm'

import { getDb } from './client'
import { notes } from './schema'

export interface NoteCounts {
  readonly quotes: number
  readonly notes: number
  readonly total: number
}

export const NO_NOTES: NoteCounts = { quotes: 0, notes: 0, total: 0 }

/** Live notes only: a deleted one, or one deleted with its book, counts toward nothing. */
export async function getNoteCounts(bookId: string): Promise<NoteCounts> {
  const rows = await getDb()
    .select({ type: notes.type, n: count() })
    .from(notes)
    .where(and(eq(notes.bookId, bookId), isNull(notes.deletedAt)))
    .groupBy(notes.type)
  let quotes = 0
  let plain = 0
  for (const row of rows) {
    if (row.type === 'quote') quotes += row.n
    else plain += row.n
  }
  return { quotes, notes: plain, total: quotes + plain }
}
