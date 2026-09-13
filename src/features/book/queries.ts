/**
 * src/features/book/queries.ts
 *
 * All SQL for book detail and its actions sheet. Reads here; every write goes through
 * `db/write.ts`, like everywhere else.
 */

import { and, desc, eq, isNull } from 'drizzle-orm'

import { getDb } from '@/db/client'
import { progressAggregates } from '@/db/progressAggregates'
import { books, reads, sessions, type ReadStatus, type SessionFormat } from '@/db/schema'
import { restoreRow, softDelete, updateRow, writeRow, type WriteOutcome } from '@/db/write'
import { canStartReread } from '@/domain/reads'
import type { UnixMs } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { appError, err, type Result } from '@/lib/result'

export interface BookSummary {
  readonly id: string
  readonly title: string
  readonly author: string | null
  readonly pageCount: number | null
  readonly totalMinutes: number | null
  readonly coverUrl: string | null
  readonly coverLocalPath: string | null
  readonly coverColor: string | null
  readonly publisher: string | null
  readonly publishedYear: number | null
}

export interface ReadSummary {
  readonly readId: string
  readonly readNumber: number
  readonly status: ReadStatus
  readonly rating: number | null
  /** Set only when the reader chose it. Null means: derive from the sessions. */
  readonly startedAt: UnixMs | null
  readonly finishedAt: UnixMs | null
  readonly page: number | null
  readonly minute: number | null
  readonly pagesRead: number
  readonly minutesRead: number
  readonly unusable: number
  readonly sessionCount: number
  readonly firstSessionAt: UnixMs | null
  readonly lastSessionAt: UnixMs | null
}

export interface BookDetail {
  readonly book: BookSummary
  /** The newest read. Every live book has one. */
  readonly current: ReadSummary
  /** Earlier reads, newest first. Each keeps its own rating, dates and sessions. */
  readonly previous: readonly ReadSummary[]
}

export interface SessionEntry {
  readonly id: string
  readonly occurredAt: UnixMs
  readonly format: SessionFormat
  readonly fromPosition: number | null
  readonly toPosition: number | null
  readonly durationSeconds: number | null
  readonly isTimed: number
  readonly note: string | null
}

/**
 * A live book with its reads, or null.
 *
 * Null is a normal answer, not an error: the book was deleted from another screen, undone
 * and redone, or reached through a stale route. The screen says so and offers a way back.
 * A book with no live read is also null, because nothing on this screen can be drawn
 * without one — and the cascade in write.ts means that shape should not exist.
 */
export async function getBookDetail(bookId: string): Promise<BookDetail | null> {
  const db = getDb()
  const bookRows = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      pageCount: books.pageCount,
      totalMinutes: books.totalMinutes,
      coverUrl: books.coverUrl,
      coverLocalPath: books.coverLocalPath,
      coverColor: books.coverColor,
      publisher: books.publisher,
      publishedYear: books.publishedYear,
    })
    .from(books)
    .where(and(eq(books.id, bookId), isNull(books.deletedAt)))
    .limit(1)
  const book = bookRows[0]
  if (!book) return null

  const readRows = await db
    .select({
      readId: reads.id,
      readNumber: reads.readNumber,
      status: reads.status,
      rating: reads.rating,
      startedAt: reads.startedAt,
      finishedAt: reads.finishedAt,
      ...progressAggregates,
    })
    .from(reads)
    .leftJoin(sessions, and(eq(sessions.readId, reads.id), isNull(sessions.deletedAt)))
    .where(and(eq(reads.bookId, bookId), isNull(reads.deletedAt)))
    .groupBy(reads.id)
    .orderBy(desc(reads.readNumber))

  const [current, ...previous] = readRows
  if (!current) return null
  return { book, current, previous }
}

/** Every live session of one read, newest first, furthest first within one instant. */
export async function getSessionsForRead(readId: string): Promise<SessionEntry[]> {
  return (
    getDb()
      .select({
        id: sessions.id,
        occurredAt: sessions.occurredAt,
        format: sessions.format,
        fromPosition: sessions.fromPosition,
        toPosition: sessions.toPosition,
        durationSeconds: sessions.durationSeconds,
        isTimed: sessions.isTimed,
        note: sessions.note,
      })
      .from(sessions)
      .where(and(eq(sessions.readId, readId), isNull(sessions.deletedAt)))
      // Two sessions logged for the same minute are ordinary. Without a tie-break their order
      // was arbitrary, and the phone showed 57 → 76 above 76 → 95: backwards.
      .orderBy(desc(sessions.occurredAt), desc(sessions.toPosition), desc(sessions.id))
  )
}

// ─── ACTIONS ─────────────────────────────────────────────────────────────────

/**
 * Move a read to another status, including DNF.
 *
 * Only the status changes. DNF keeps every page already read (04-SCREENS, Journey H), so
 * nothing else is touched. Moving to Finished does NOT write `finished_at`: a null there
 * means "derive it from the sessions", and writing a computed value would make it
 * indistinguishable from a date the reader chose (03-DATA-MODEL, `reads`). The finish flow,
 * with its date and rating, is Slice 5's.
 */
export async function setReadStatus(
  readId: string,
  status: ReadStatus,
): Promise<Result<WriteOutcome>> {
  return updateRow('reads', readId, { status })
}

/**
 * Start a re-read: a new `reads` row, numbered after the newest, in Reading.
 *
 * The previous read keeps its rating, review, dates and sessions untouched, because it is
 * a different row (04-SCREENS, Journey F). The next number is read and then written, which
 * is a race in principle; the partial unique index on (book_id, read_number) is what makes
 * losing it an error the sheet reports — "it clashes with something added since" — rather
 * than two reads sharing a number.
 */
export async function startReread(bookId: string): Promise<Result<void>> {
  const current = await getDb()
    .select({ number: reads.readNumber, status: reads.status })
    .from(reads)
    .where(and(eq(reads.bookId, bookId), isNull(reads.deletedAt)))
    .orderBy(desc(reads.readNumber))
    .limit(1)
  const top = current[0]
  // Enforced here, not only by hiding the action: a re-read beside a read still in progress
  // put the book on the Reading tab twice (domain/reads.ts).
  if (top && !canStartReread(top.status)) {
    return err(
      appError('recoverable', 'This book is still being read', {
        safe: 'Finish it or mark it DNF first. Nothing was changed.',
      }),
    )
  }
  const next = (top?.number ?? 0) + 1
  return writeRow('reads', {
    id: newId(),
    bookId,
    status: 'reading',
    rating: null,
    review: null,
    isPrivate: 1,
    startedAt: null,
    finishedAt: null,
    readNumber: next,
  })
}

/** Remove a book. Soft, cascading to its reads, sessions, notes and shelf assignments. */
export async function removeBook(bookId: string): Promise<Result<WriteOutcome>> {
  return softDelete('books', bookId)
}

/** Undo `removeBook`: restores exactly what that delete took, and nothing deleted before. */
export async function restoreBook(bookId: string): Promise<Result<WriteOutcome>> {
  return restoreRow('books', bookId)
}
