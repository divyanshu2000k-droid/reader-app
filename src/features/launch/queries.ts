/**
 * src/features/launch/queries.ts
 *
 * All SQL for the launch gates. Two questions, both asked once per launch and both on the
 * critical path, so both are single indexed queries.
 */

import { and, eq, isNull, sql } from 'drizzle-orm'

import { getDb } from '@/db/client'
import { books, reads, sessions } from '@/db/schema'
import { softDelete, updateRow } from '@/db/write'
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

  return rows[0] ?? null
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
  return updateRow('sessions', id, { durationSeconds: safe })
}

/** Throw away a recovered session. Soft, like every delete, so it is recoverable. */
export async function discardOpenSession(id: string): Promise<Result<WriteOutcome>> {
  return softDelete('sessions', id)
}

/**
 * Does this device hold any library data at all?
 *
 * Gate 4 (restore) asks this: a signed-in reader with an empty database is on a new phone
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
