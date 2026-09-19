/**
 * src/features/timer/queries.ts
 *
 * All SQL for the timer. Reads here; every write to the reader's library goes through
 * `db/write.ts`, and the running timer's own state goes to `metadata_cache`, which never
 * syncs (`timerRun.ts` explains why).
 *
 * **Start writes the `sessions` row immediately** (04-SCREENS), before the ring has drawn a
 * single frame, so a crash one second in still leaves a record that reading happened. The
 * row is `is_timed = 1` with `duration_seconds` NULL, which is precisely the shape the launch
 * recovery gate looks for.
 */

import { and, desc, eq, isNull } from 'drizzle-orm'

import { RUN_SOURCE, decodeRun, encodeRun, type TimerRun } from '@/domain/timerRun'
import { getDb } from '@/db/client'
import { ASKED_KEY, PRIMING_SOURCE } from '@/db/localRecords'
import { books, metadataCache, reads, sessions, type SessionFormat } from '@/db/schema'
import {
  clearLocalRecord,
  saveLocalRecord,
  softDelete,
  updateRow,
  writeRow,
  type WriteOutcome,
} from '@/db/write'
import { currentPosition, type ProgressSession } from '@/domain/progress'
import { isAudiobook } from '@/domain/progressDisplay'
import { now } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { appError, err, ok, type Result } from '@/lib/result'

export interface TimerBook {
  readonly id: string
  readonly title: string
  readonly author: string | null
  readonly coverUrl: string | null
  readonly coverLocalPath: string | null
  readonly coverColor: string | null
  readonly pageCount: number | null
  readonly totalMinutes: number | null
}

export interface TimerContext {
  readonly book: TimerBook
  readonly readId: string
  /** Where the reader is now, in the format this read is being read in. */
  readonly fromPosition: number | null
  readonly format: SessionFormat
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

/**
 * What the timer needs to start on a book: its current read and where the reader has got to.
 * Null when the book is not in the library.
 */
export async function getTimerContext(bookId: string): Promise<TimerContext | null> {
  const rows = await getDb()
    .select({ book: bookColumns, readId: reads.id })
    .from(reads)
    .innerJoin(books, eq(reads.bookId, books.id))
    .where(and(eq(books.id, bookId), isNull(books.deletedAt), isNull(reads.deletedAt)))
    .orderBy(desc(reads.readNumber))
    .limit(1)
  const row = rows[0]
  if (!row) return null

  const priors = await getDb()
    .select({
      format: sessions.format,
      fromPosition: sessions.fromPosition,
      toPosition: sessions.toPosition,
      durationSeconds: sessions.durationSeconds,
      occurredAt: sessions.occurredAt,
      localDay: sessions.localDay,
    })
    .from(sessions)
    .where(and(eq(sessions.readId, row.readId), isNull(sessions.deletedAt)))
  const list: ProgressSession[] = priors
  const page = currentPosition(list, 'pages')
  const minute = currentPosition(list, 'minutes')
  // The ONE definition of an audiobook (domain/progressDisplay.ts), so a timed audiobook
  // session measures minutes and a timed print session measures pages.
  const audio = isAudiobook({ totalMinutes: row.book.totalMinutes, page, minute })
  return {
    book: row.book,
    readId: row.readId,
    format: audio ? 'minutes' : 'pages',
    fromPosition: audio ? minute : page,
  }
}

/**
 * The open timed session, if one exists: `is_timed = 1` with no duration yet.
 *
 * **OLDEST first, and that must match `features/launch/queries.ts`.** Two open timed sessions
 * can only exist through a bug, but if they ever do, the timer resuming one while the launch
 * recovery gate asks about the other is two answers to one question. This ordering was
 * `desc()` until the 2026-09-18 audit, so the two sides silently disagreed.
 *
 * The rule is duplicated rather than shared because the two live in different features; if a
 * third caller appears, it belongs in `db/` beside `currentRead.ts`.
 */
export async function getOpenTimedSession(): Promise<{
  readonly sessionId: string
  readonly readId: string
  readonly occurredAt: number
} | null> {
  const rows = await getDb()
    .select({
      sessionId: sessions.id,
      readId: sessions.readId,
      occurredAt: sessions.occurredAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.isTimed, 1),
        isNull(sessions.durationSeconds),
        isNull(sessions.deletedAt),
      ),
    )
    .orderBy(desc(sessions.occurredAt))
    .limit(1)
  return rows[0] ?? null
}

/**
 * The book and position for a read that is ALREADY being timed, for resuming.
 *
 * Separate from `getTimerContext`, which starts from a book id. Resuming starts from the open
 * session's `read_id`, and the timer must not reach into `features/book` to resolve it:
 * features may not import from one another (06-CONVENTIONS).
 */
export async function getTimerContextForRead(readId: string): Promise<TimerContext | null> {
  const rows = await getDb()
    .select({ book: bookColumns, readId: reads.id })
    .from(reads)
    .innerJoin(books, eq(reads.bookId, books.id))
    .where(and(eq(reads.id, readId), isNull(reads.deletedAt), isNull(books.deletedAt)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return getTimerContext(row.book.id)
}

/**
 * Whether a session this device is timing is still live.
 *
 * False when the row is soft-deleted or gone — which is what removing the BOOK does, through
 * the cascade in `write.ts`: books → reads → sessions. The timer has to be able to ask,
 * because nothing tells it otherwise, and a timer counting into a deleted session is a number
 * that will never be saved.
 */
export async function isSessionLive(sessionId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), isNull(sessions.deletedAt)))
    .limit(1)
  return rows.length === 1
}

/** The stored state of a running timer, or null. Local only. */
export async function readRun(sessionId: string): Promise<TimerRun | null> {
  const rows = await getDb()
    .select({ payload: metadataCache.payload })
    .from(metadataCache)
    .where(and(eq(metadataCache.source, RUN_SOURCE), eq(metadataCache.sourceId, sessionId)))
    .limit(1)
  const payload = rows[0]?.payload
  return payload === undefined ? null : decodeRun(payload)
}

/**
 * Has the reader already been asked whether the timer may show a notification?
 *
 * True after any answer, including "Not now". Android only counts an answer it was given
 * itself, and "Not now" is deliberately never given to Android — so without this the sheet
 * returns on every new timer for a reader who has already declined.
 */
export async function hasBeenAskedToNotify(): Promise<boolean> {
  const rows = await getDb()
    .select({ payload: metadataCache.payload })
    .from(metadataCache)
    .where(and(eq(metadataCache.source, PRIMING_SOURCE), eq(metadataCache.sourceId, ASKED_KEY)))
    .limit(1)
  return rows.length === 1
}

/** Remember the answer, whichever way it went. Never asked again after this. */
export async function rememberAskedToNotify(): Promise<Result<void>> {
  return saveLocalRecord(PRIMING_SOURCE, ASKED_KEY, String(now()))
}

export async function saveRun(run: TimerRun): Promise<Result<void>> {
  return saveLocalRecord(RUN_SOURCE, run.sessionId, encodeRun(run))
}

export async function clearRun(sessionId: string): Promise<Result<void>> {
  return clearLocalRecord(RUN_SOURCE, sessionId)
}

export interface StartedTimer {
  readonly sessionId: string
  readonly run: TimerRun
}

/**
 * Start a timer: the `sessions` row first, then the run.
 *
 * In that order deliberately. If the run write fails the reader still has a session row the
 * recovery gate will find, and the worst case is the wider `now - startedAt` bound. If the
 * session write failed we must not pretend a timer is running, so that failure is returned.
 */
export async function startTimer(context: TimerContext): Promise<Result<StartedTimer>> {
  const at = now()
  const sessionId = newId()
  const written = await writeRow('sessions', {
    id: sessionId,
    readId: context.readId,
    occurredAt: at,
    format: context.format,
    fromPosition: context.fromPosition,
    toPosition: null,
    durationSeconds: null,
    isTimed: 1,
    note: null,
  })
  if (!written.ok) return written
  const run: TimerRun = {
    sessionId,
    readId: context.readId,
    bookId: context.book.id,
    segments: [{ startedAt: at, endedAt: null }],
    lastBeatAt: at,
  }
  // A failed run write is survivable; a failed session write was not. Not awaited into a
  // failure return for that reason.
  await saveRun(run)
  return ok({ sessionId, run })
}

/**
 * Finish: write the duration and where the reader got to, then forget the run.
 *
 * `durationSeconds` stops being NULL, which is what takes the session out of the recovery
 * gate's sight. The run is cleared second, so a crash between the two leaves a finished
 * session and a stale run rather than an open session with none.
 */
export async function finishTimer(
  sessionId: string,
  durationSeconds: number,
  toPosition: number | null,
): Promise<Result<WriteOutcome>> {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return err(
      appError('recoverable', 'Could not save this session', {
        safe: 'Nothing was changed. Log it by hand from the book and nothing is lost.',
      }),
    )
  }
  const saved = await updateRow('sessions', sessionId, {
    durationSeconds: Math.floor(durationSeconds),
    ...(toPosition === null ? {} : { toPosition }),
  })
  if (!saved.ok) return saved
  await clearRun(sessionId)
  return saved
}

/** Throw the session away: soft delete, so it waits in Recently Deleted like any other. */
export async function discardTimer(sessionId: string): Promise<Result<WriteOutcome>> {
  const deleted = await softDelete('sessions', sessionId)
  if (!deleted.ok) return deleted
  await clearRun(sessionId)
  return deleted
}
