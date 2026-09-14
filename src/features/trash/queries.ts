/**
 * src/features/trash/queries.ts
 *
 * All SQL for Recently Deleted: removed books, and since Slice 3, sessions deleted on their
 * own. Notes join with Slice 5b, the slice that lets a reader delete one.
 *
 * A session deleted WITH its book is not listed separately: restoring the book brings it back
 * (write.ts, the cascade), and listing it twice would offer to restore it under a book that is
 * still deleted, which `restoreRow` refuses. So only sessions whose read and book are live.
 *
 * The 30-day purge (03-DATA-MODEL, sync rule 6) is not built; it arrives with sync in
 * Slice 8. Until then nothing is ever removed for good, so this lists everything deleted
 * rather than hiding what is past 30 days: a row hidden but not purged is data the reader
 * can no longer see and has not lost, which is the worst of both.
 */

import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import { getDb } from '@/db/client'
import { books, reads, sessions, type SessionFormat } from '@/db/schema'
import { restoreRow, type WriteOutcome } from '@/db/write'
import type { UnixMs } from '@/lib/dates'
import type { Result } from '@/lib/result'

export interface DeletedBook {
  readonly kind: 'book'
  readonly id: string
  readonly title: string
  readonly author: string | null
  readonly coverUrl: string | null
  readonly coverLocalPath: string | null
  readonly coverColor: string | null
  readonly deletedAt: UnixMs
}

export interface DeletedSession {
  readonly kind: 'session'
  readonly id: string
  readonly bookTitle: string
  readonly occurredAt: UnixMs
  readonly format: SessionFormat
  readonly fromPosition: number | null
  readonly toPosition: number | null
  readonly durationSeconds: number | null
  readonly deletedAt: UnixMs
}

export type DeletedItem = DeletedBook | DeletedSession

/** Deleted books, most recently removed first. */
async function getDeletedBooks(): Promise<DeletedBook[]> {
  const rows = await getDb()
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
  return rows.map((r) => ({ kind: 'book', ...r }))
}

/** Sessions deleted on their own, under a live read of a live book. */
async function getDeletedSessions(): Promise<DeletedSession[]> {
  const rows = await getDb()
    .select({
      id: sessions.id,
      bookTitle: books.title,
      occurredAt: sessions.occurredAt,
      format: sessions.format,
      fromPosition: sessions.fromPosition,
      toPosition: sessions.toPosition,
      durationSeconds: sessions.durationSeconds,
      deletedAt: sql<number>`${sessions.deletedAt}`,
    })
    .from(sessions)
    .innerJoin(reads, eq(sessions.readId, reads.id))
    .innerJoin(books, eq(reads.bookId, books.id))
    .where(and(isNotNull(sessions.deletedAt), isNull(reads.deletedAt), isNull(books.deletedAt)))
    .orderBy(desc(sessions.deletedAt))
  return rows.map((r) => ({ kind: 'session', ...r }))
}

/** Everything deleted, most recently deleted first. */
export async function getDeletedItems(): Promise<DeletedItem[]> {
  const [bookRows, sessionRows] = await Promise.all([getDeletedBooks(), getDeletedSessions()])
  return [...bookRows, ...sessionRows].sort((a, b) => b.deletedAt - a.deletedAt)
}

/** Restore a book and exactly what its removal took with it, or one session. */
export async function restoreDeleted(item: DeletedItem): Promise<Result<WriteOutcome>> {
  return restoreRow(item.kind === 'book' ? 'books' : 'sessions', item.id)
}
