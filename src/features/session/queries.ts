/**
 * src/features/session/queries.ts
 *
 * All SQL for logging, editing and deleting a session, and for Session complete. Reads here;
 * every write goes through `db/write.ts`, which derives `local_day` from `occurred_at` and
 * queues the sync in the same transaction.
 */

import { and, desc, eq, isNull, ne } from 'drizzle-orm'

import type { OtherSession, Positions, SessionPatch, StoredSession } from './sessionForm'
import { getDb } from '@/db/client'
import { books, reads, sessions, type ReadStatus, type SessionFormat } from '@/db/schema'
import {
  restoreRow,
  softDelete,
  updateRow,
  writeRow,
  type RowFor,
  type WriteOutcome,
} from '@/db/write'
import { currentPosition, type ProgressSession } from '@/domain/progress'
import type { LocalDay } from '@/lib/dates'
import { injectedError, isFaultArmed } from '@/lib/faults'
import { appError, err, ok, type Result } from '@/lib/result'
import { errors } from '@/lib/strings'

export interface LogBook {
  readonly id: string
  readonly title: string
  readonly author: string | null
  readonly coverUrl: string | null
  readonly coverLocalPath: string | null
  readonly coverColor: string | null
  readonly pageCount: number | null
  readonly totalMinutes: number | null
}

export interface LogRead {
  readonly readId: string
  readonly status: ReadStatus
}

/** One live session of a read, with everything the logger, the hints and the maths need. */
export interface ReadSession extends OtherSession, ProgressSession {
  readonly id: string
  readonly durationSeconds: number | null
  readonly isTimed: number
  readonly note: string | null
}

/** Everything the logger needs to open, for a new session or an edit. */
export interface LogContext {
  readonly book: LogBook
  readonly read: LogRead
  /** Where the reader is in this read, per format. */
  readonly positions: Positions
  /** The format of this read's latest session, or null for a first session. */
  readonly latestFormat: SessionFormat | null
  /** Every live session of this read, newest first. */
  readonly sessions: readonly ReadSession[]
}

export interface EditContext extends LogContext {
  readonly session: StoredSession & { readonly note: string | null; readonly isTimed: number }
}

const bookColumns = {
  id: books.id,
  title: books.title,
  author: books.author,
  coverUrl: books.coverUrl,
  coverLocalPath: books.coverLocalPath,
  coverColor: books.coverColor,
  pageCount: books.pageCount,
  totalMinutes: books.totalMinutes,
}

async function sessionsOfRead(readId: string): Promise<ReadSession[]> {
  return getDb()
    .select({
      id: sessions.id,
      format: sessions.format,
      fromPosition: sessions.fromPosition,
      toPosition: sessions.toPosition,
      occurredAt: sessions.occurredAt,
      localDay: sessions.localDay,
      durationSeconds: sessions.durationSeconds,
      isTimed: sessions.isTimed,
      note: sessions.note,
    })
    .from(sessions)
    .where(and(eq(sessions.readId, readId), isNull(sessions.deletedAt)))
    .orderBy(desc(sessions.occurredAt), desc(sessions.toPosition), desc(sessions.id))
}

function contextFrom(book: LogBook, read: LogRead, list: ReadSession[]): LogContext {
  return {
    book,
    read,
    positions: {
      pages: currentPosition(list, 'pages'),
      minutes: currentPosition(list, 'minutes'),
    },
    latestFormat: list[0]?.format ?? null,
    sessions: list,
  }
}

/**
 * Logging a new session for a book: its CURRENT read, the live read with the highest number
 * (db/currentRead.ts). Null when the book is not in the library.
 */
export async function getLogContextForBook(bookId: string): Promise<LogContext | null> {
  const rows = await getDb()
    .select({ book: bookColumns, readId: reads.id, status: reads.status })
    .from(reads)
    .innerJoin(books, eq(reads.bookId, books.id))
    .where(and(eq(books.id, bookId), isNull(books.deletedAt), isNull(reads.deletedAt)))
    .orderBy(desc(reads.readNumber))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return contextFrom(
    row.book,
    { readId: row.readId, status: row.status },
    await sessionsOfRead(row.readId),
  )
}

/**
 * Editing a session: the read it belongs to, which is not necessarily the current one. An
 * earlier read's session is edited in that read. Null when the session, its read or its book
 * is gone.
 */
export async function getEditContext(sessionId: string): Promise<EditContext | null> {
  const rows = await getDb()
    .select({
      book: bookColumns,
      readId: reads.id,
      status: reads.status,
      session: {
        id: sessions.id,
        format: sessions.format,
        fromPosition: sessions.fromPosition,
        toPosition: sessions.toPosition,
        occurredAt: sessions.occurredAt,
        durationSeconds: sessions.durationSeconds,
        note: sessions.note,
        isTimed: sessions.isTimed,
      },
    })
    .from(sessions)
    .innerJoin(reads, eq(sessions.readId, reads.id))
    .innerJoin(books, eq(reads.bookId, books.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.deletedAt),
        isNull(reads.deletedAt),
        isNull(books.deletedAt),
      ),
    )
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const list = await sessionsOfRead(row.readId)
  return {
    ...contextFrom(row.book, { readId: row.readId, status: row.status }, list),
    session: row.session,
  }
}

/**
 * Every day with at least one live session, for the streak. `local_day`, never
 * `date(occurred_at)`: that buckets in UTC (03-DATA-MODEL). The cascade soft-deletes a
 * deleted book's sessions, so they drop out of the streak with it.
 *
 * `except` leaves one session out, for Session complete: while the reader is changing that
 * session's date, the streak is the other sessions' days plus the day being chosen, not the
 * day it was saved on.
 */
export async function getReadingDays(except?: string): Promise<LocalDay[]> {
  const rows = await getDb()
    .selectDistinct({ day: sessions.localDay })
    .from(sessions)
    .where(
      except === undefined
        ? isNull(sessions.deletedAt)
        : and(isNull(sessions.deletedAt), ne(sessions.id, except)),
    )
  return rows.map((r) => r.day)
}

// ─── WRITES ──────────────────────────────────────────────────────────────────

function injectedSaveFailure() {
  return err(
    appError('recoverable', errors.sessionSaveFailed.message, {
      safe: `${errors.sessionSaveFailed.safe} This failure was forced from Settings.`,
      cause: injectedError('sessionSave'),
    }),
  )
}

export interface CreatedSession {
  readonly sessionId: string
  /** True when logging moved a Want read to Reading. */
  readonly startedReading: boolean
}

/**
 * Save a new session, and move a Want read to Reading.
 *
 * A reader logging pages has started the book, and leaving it on Want would hide the book
 * they are reading from the Reading tab. The move is a second write, after the session and
 * not in its transaction (a public write function cannot run inside another's). If only the
 * move fails, the session is still saved, which is the half that matters: it says so, and
 * the reader can move the book from its actions sheet.
 */
export async function createSession(
  row: RowFor<'sessions'>,
  readStatus: ReadStatus,
): Promise<Result<CreatedSession>> {
  if (isFaultArmed('sessionSave')) return injectedSaveFailure()
  const saved = await writeRow('sessions', row)
  if (!saved.ok) return saved
  if (readStatus !== 'want') return ok({ sessionId: row.id, startedReading: false })
  const moved = await updateRow('reads', row.readId, { status: 'reading' })
  return ok({ sessionId: row.id, startedReading: moved.ok && moved.value.changed })
}

/** Save an edit. An empty patch writes nothing and queues nothing. */
export async function updateSession(
  sessionId: string,
  patch: SessionPatch,
): Promise<Result<WriteOutcome>> {
  if (isFaultArmed('sessionSave')) return injectedSaveFailure()
  return updateRow('sessions', sessionId, patch)
}

/** The quick thought from Session complete. An empty note clears the column. */
export async function saveSessionNote(
  sessionId: string,
  note: string,
): Promise<Result<WriteOutcome>> {
  if (isFaultArmed('sessionSave')) return injectedSaveFailure()
  const trimmed = note.trim()
  return updateRow('sessions', sessionId, { note: trimmed === '' ? null : trimmed })
}

/** Soft. It waits in Recently Deleted, and the toast's Undo is `restoreSession`. */
export async function deleteSession(sessionId: string): Promise<Result<WriteOutcome>> {
  return softDelete('sessions', sessionId)
}

/** Refused, with the reason, if the session's read or book has been deleted since. */
export async function restoreSession(sessionId: string): Promise<Result<WriteOutcome>> {
  return restoreRow('sessions', sessionId)
}
