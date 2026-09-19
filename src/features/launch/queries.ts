/**
 * src/features/launch/queries.ts
 *
 * All SQL for the launch gates. Two questions, both asked once per launch and both on the
 * critical path, so both are single indexed queries.
 */

import { and, eq, isNull, sql } from 'drizzle-orm'

import { getDb } from '@/db/client'
import { books, reads, sessions, metadataCache } from '@/db/schema'
import { RUN_SOURCE } from '@/db/localRecords'
import { clearTimerNotification } from '@/ui/timerNotification'
import { lastNativeBeat } from '@/modules/reading-service'
import { decodeRun, recoveryBoundAt } from '@/domain/timerRun'
import { elapsedSeconds } from '@/domain/timerState'
import { now } from '@/lib/dates'
import { clearLocalRecord, softDelete, updateRow } from '@/db/write'
import type { UnixMs } from '@/lib/dates'
import type { Result } from '@/lib/result'
import type { WriteOutcome } from '@/db/write'

/**
 * A session the app was in the middle of when it was last killed.
 *
 * `is_timed = 1 AND duration_seconds IS NULL` is the schema's definition of "still
 * running" — see `03-DATA-MODEL.md`. A manually logged session always carries its
 * duration or none at all, so it can never look open.
 */
export interface OpenSession {
  readonly id: string
  readonly occurredAt: UnixMs
  /**
   * The most the reader can have read, in seconds, bounded by the timer's last heartbeat.
   *
   * Without the timer this is simply `now - occurred_at`, which is what the sheet used
   * alone until 2026-09-18 — at which point the heartbeat had been written for a whole
   * slice and read by nobody. A session killed at 23:00 and reopened at 08:00 was still
   * offering nine hours as its upper bound, which is a measurement of how long the app was
   * shut. See `domain/timerRun.ts`.
   */
  readonly boundedSeconds: number
  /**
   * Wall clock since the session started: the only genuine upper bound on the reading.
   *
   * Separate from `boundedSeconds` since 2026-09-19. The heartbeat bound is how long the APP
   * is known to have been alive, and a reader reads for longer than that every time their
   * phone stops the timer — measured with background usage restricted, Android killed the
   * service 47 seconds into a five-minute session. Capping the reader at the heartbeat threw
   * away the other four minutes and told them "it started 1 minute ago", which was false.
   */
  readonly maxSeconds: number
  readonly bookTitle: string
  readonly bookAuthor: string | null
  readonly coverLocalPath: string | null
  readonly coverUrl: string | null
  readonly coverColor: string | null
}

/**
 * The one unfinished session, or null.
 *
 * Returns the OLDEST if somehow there is more than one: a second open session can only
 * exist through a bug, and in that case the reader should be asked about the one they are
 * least likely to remember starting. The others stay open and are offered on the next
 * launch rather than being silently dropped.
 */
export async function getOpenSession(): Promise<OpenSession | null> {
  const rows = await getDb()
    .select({
      id: sessions.id,
      occurredAt: sessions.occurredAt,
      bookTitle: books.title,
      bookAuthor: books.author,
      coverLocalPath: books.coverLocalPath,
      coverUrl: books.coverUrl,
      coverColor: books.coverColor,
    })
    .from(sessions)
    .innerJoin(reads, eq(sessions.readId, reads.id))
    .innerJoin(books, eq(reads.bookId, books.id))
    .where(
      and(
        eq(sessions.isTimed, 1),
        isNull(sessions.durationSeconds),
        isNull(sessions.deletedAt),
        // A session whose read or book was deleted is not something to ask about. The
        // cascade in write.ts already soft-deletes sessions under a deleted read, so this
        // is belt and braces against a row that predates it.
        isNull(reads.deletedAt),
        isNull(books.deletedAt),
      ),
    )
    .orderBy(sessions.occurredAt)
    .limit(1)

  const row = rows[0]
  if (row === undefined) return null

  // The timer's own record, if this session came from the timer. Absent for a session from
  // before Slice 6, or one whose local record was lost: both fall back to the wider bound.
  const stored = await getDb()
    .select({ payload: metadataCache.payload })
    .from(metadataCache)
    .where(and(eq(metadataCache.source, RUN_SOURCE), eq(metadataCache.sourceId, row.id)))
    .limit(1)
  const payload = stored[0]?.payload
  const run = payload === undefined ? null : decodeRun(payload)
  const at = now()
  /**
   * The NATIVE heartbeat, read before the bound is computed.
   *
   * The heartbeat stored in the run stops the instant the app is backgrounded (React
   * Native's timers need frames), so for a session that was killed while the phone was in a
   * pocket it is frozen at the moment the reader last looked at the screen. The foreground
   * service beats on its own thread and does not care about frames. `recoveryBoundAt` takes
   * the later of the two.
   */
  const boundedSeconds =
    run === null
      ? Math.max(0, (at - row.occurredAt) / 1000)
      : elapsedSeconds(run, recoveryBoundAt(run, at, lastNativeBeat()))

  /**
   * The wall clock since the session started: the only genuine upper bound.
   *
   * `boundedSeconds` is how long the APP is known to have been running, which since the
   * heartbeat landed can be far less than how long the READER read — every time the phone
   * stops the timer and they carry on. The sheet suggests the first and allows up to the
   * second. See `recoveryPolicy.ts`.
   */
  const maxSeconds = Math.max(0, (at - row.occurredAt) / 1000)

  return { ...row, boundedSeconds, maxSeconds }
}

/**
 * Close a recovered session with the duration the READER confirmed.
 *
 * Never the elapsed time on its own: that is how long the app was closed, not how long
 * anyone read. The sheet makes the reader see and accept a number first, and
 * recoveryPolicy.ts bounds it. See DECISIONS.md, 2026-09-10.
 *
 * Writing `duration_seconds` is what makes it no longer "still running", so the gate does
 * not offer it again on the next launch. The reader is not asked for a page count here:
 * the session logger is Slice 3, and inventing a position they did not give would be
 * writing data on their behalf. The session keeps its date, and its position stays blank
 * until they fill it in.
 */
export async function keepOpenSession(
  id: string,
  confirmedSeconds: number,
): Promise<Result<WriteOutcome>> {
  // Never negative, always a whole number of seconds, even if a caller skips the policy.
  const safe = Math.max(0, Math.round(confirmedSeconds))
  const saved = await updateRow('sessions', id, { durationSeconds: safe })
  // The notification is ONGOING with `stopWithTask="false"`, so it OUTLIVES the process that
  // posted it. A crashed timer therefore leaves it in the shade, and recovering the session
  // here is the only moment anything can take it down. Missing this was the same leak as the
  // `timer_run` row below, in the same function, found by the 2026-09-18 audit rather than by
  // the rule that says to look for it.
  await clearTimerNotification()
  // The timer's own record is now meaningless: the session has a duration and will never be
  // recovered again. Left behind, every crash leaked one row nothing would read or remove
  // (db/localRecords.ts). Not awaited into the result: failing to tidy up must not make a
  // saved session look unsaved.
  await clearLocalRecord(RUN_SOURCE, id)
  return saved
}

/** Throw away a recovered session. Soft, like every delete, so it is recoverable. */
export async function discardOpenSession(id: string): Promise<Result<WriteOutcome>> {
  const deleted = await softDelete('sessions', id)
  await clearTimerNotification()
  await clearLocalRecord(RUN_SOURCE, id)
  return deleted
}

/**
 * Does this device hold any library data at all?
 *
 * Gate 3 (restore) asks this: a signed-in reader with an empty database is on a new phone
 * and their books need fetching. Counts every book including soft-deleted ones, because a
 * database holding only deleted rows is still a database that has been used — restoring
 * over it would duplicate everything the reader deliberately threw away.
 */
export async function isLibraryEmpty(): Promise<boolean> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(books)
  return (rows[0]?.n ?? 0) === 0
}
