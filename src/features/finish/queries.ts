/**
 * src/features/finish/queries.ts
 *
 * All SQL for the finish flow. Reads here; the one write goes through `db/write.ts`.
 */

import { and, eq, isNull } from 'drizzle-orm'

import type { FinishForm, FinishRead } from './finishForm'
import { finishPatch } from './finishForm'
import { getDb } from '@/db/client'
import { getFinishedReads } from '@/db/finishedReads'
import { progressAggregates } from '@/db/progressAggregates'
import { books, reads, sessions } from '@/db/schema'
import { updateRow, type WriteOutcome } from '@/db/write'
import type { FinishedRead } from '@/domain/finishes'
import { injectedError, isFaultArmed } from '@/lib/faults'
import { appError, err, type Result } from '@/lib/result'

export interface FinishBook {
  readonly id: string
  readonly title: string
  readonly coverUrl: string | null
  readonly coverLocalPath: string | null
  readonly coverColor: string | null
}

export interface FinishContext {
  readonly book: FinishBook
  readonly read: FinishRead
  /** Every finished read in the library, for "your 31st book this year". */
  readonly finished: readonly FinishedRead[]
}

/**
 * A live read of a live book, with its progress, or null when either is gone: removed from
 * another screen while this one was on its way.
 */
export async function getFinishContext(readId: string): Promise<FinishContext | null> {
  const db = getDb()
  const rows = await db
    .select({
      bookId: books.id,
      title: books.title,
      coverUrl: books.coverUrl,
      coverLocalPath: books.coverLocalPath,
      coverColor: books.coverColor,
      readId: reads.id,
      status: reads.status,
      rating: reads.rating,
      review: reads.review,
      startedAt: reads.startedAt,
      finishedAt: reads.finishedAt,
      firstSessionAt: progressAggregates.firstSessionAt,
      lastSessionAt: progressAggregates.lastSessionAt,
      pagesRead: progressAggregates.pagesRead,
      minutesRead: progressAggregates.minutesRead,
    })
    .from(reads)
    .innerJoin(books, and(eq(books.id, reads.bookId), isNull(books.deletedAt)))
    .leftJoin(sessions, and(eq(sessions.readId, reads.id), isNull(sessions.deletedAt)))
    .where(and(eq(reads.id, readId), isNull(reads.deletedAt)))
    .groupBy(reads.id)
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const finished = await getFinishedReads()
  return {
    book: {
      id: row.bookId,
      title: row.title,
      coverUrl: row.coverUrl,
      coverLocalPath: row.coverLocalPath,
      coverColor: row.coverColor,
    },
    read: {
      readId: row.readId,
      status: row.status,
      rating: row.rating,
      review: row.review,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      firstSessionAt: row.firstSessionAt,
      lastSessionAt: row.lastSessionAt,
      pagesRead: row.pagesRead,
      minutesRead: row.minutesRead,
    },
    finished,
  }
}

/**
 * Save the finish: the move to Finished, the rating, the note and the date, as ONE update of the
 * read. One row, so there is no state where the book has left Reading without its rating, or
 * the other way round.
 */
export async function saveFinish(
  read: FinishRead,
  form: FinishForm,
): Promise<Result<WriteOutcome>> {
  if (isFaultArmed('finishSave')) {
    return err(
      appError('recoverable', 'Could not save this', {
        safe: 'The book was not moved and nothing was changed. This failure was forced from Settings.',
        cause: injectedError('finishSave'),
      }),
    )
  }
  return updateRow('reads', read.readId, finishPatch(read, form))
}
