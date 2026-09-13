/**
 * src/features/trash/queries.ts
 *
 * All SQL for Recently Deleted.
 *
 * Books only, in Slice 2: removing a book is the only delete a reader can perform yet.
 * Sessions and notes deleted on their own join this list with the slices that let a
 * reader delete them (3 and 5b).
 *
 * The 30-day purge (03-DATA-MODEL, sync rule 6) is not built; it arrives with sync in
 * Slice 8. Until then nothing is ever removed for good, so this lists every deleted book
 * rather than hiding the ones past 30 days: a row hidden but not purged is data the reader
 * can no longer see and has not lost, which is the worst of both.
 */

import { desc, isNotNull, sql } from 'drizzle-orm'

import { getDb } from '@/db/client'
import { books } from '@/db/schema'
import { restoreRow, type WriteOutcome } from '@/db/write'
import type { UnixMs } from '@/lib/dates'
import type { Result } from '@/lib/result'

export interface DeletedBook {
  readonly id: string
  readonly title: string
  readonly author: string | null
  readonly coverUrl: string | null
  readonly coverLocalPath: string | null
  readonly coverColor: string | null
  readonly deletedAt: UnixMs
}

/** Deleted books, most recently removed first. */
export async function getDeletedBooks(): Promise<DeletedBook[]> {
  return getDb()
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      coverUrl: books.coverUrl,
      coverLocalPath: books.coverLocalPath,
      coverColor: books.coverColor,
      // Narrowed in SQL: the WHERE clause guarantees it, and the type should say so.
      deletedAt: sql<number>`${books.deletedAt}`,
    })
    .from(books)
    .where(isNotNull(books.deletedAt))
    .orderBy(desc(books.deletedAt))
}

/** Restore a book and exactly what its removal took with it. */
export async function restoreDeletedBook(id: string): Promise<Result<WriteOutcome>> {
  return restoreRow('books', id)
}
