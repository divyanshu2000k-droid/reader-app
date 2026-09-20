/**
 * src/features/stats/queries.ts
 *
 * All SQL for Stats. In Slice 3 that is the daily pace chart's sessions; Slice 7 adds the rest.
 *
 * The sessions are loaded and counted in TypeScript by `contribution()`, not summed in SQL.
 * Fourteen days of sessions is a few dozen rows, and a second SQL copy of the counting rule
 * is exactly what device check 10 exists to police for the Library (db/progressAggregates.ts).
 * Do not add a third copy for one chart.
 */

import { and, eq, gte, isNull, sql } from 'drizzle-orm'

import { getDb } from '@/db/client'
import { books, reads, sessions } from '@/db/schema'
import type { FinishedRead } from '@/domain/finishes'
import type { GenreSource } from '@/domain/genre'
import type { ProgressSession } from '@/domain/progress'
import type { LocalDay } from '@/lib/dates'

/**
 * Every live session on or after a local day. Filters on `local_day`, the reader's calendar
 * day, never on `occurred_at` against a UTC boundary (03-DATA-MODEL). `YYYY-MM-DD` sorts as
 * text, and `idx_sessions_day` carries the filter.
 */
export async function getSessionsSince(day: LocalDay): Promise<ProgressSession[]> {
  return getDb()
    .select({
      format: sessions.format,
      fromPosition: sessions.fromPosition,
      toPosition: sessions.toPosition,
      durationSeconds: sessions.durationSeconds,
      occurredAt: sessions.occurredAt,
      localDay: sessions.localDay,
    })
    .from(sessions)
    .where(and(isNull(sessions.deletedAt), gte(sessions.localDay, day)))
}

/**
 * Every live session, for the year totals and the year switcher.
 *
 * ─── WHY THIS LOADS THEM ALL ─────────────────────────────────────────────────
 *
 * The counting rule lives in `contribution()` and nowhere else. Summing pages and minutes in
 * SQL would be a second copy of it — which is exactly what device check 10 exists to police
 * for the Library — and the rule is subtle enough that two copies would drift: an audiobook
 * logged by hand counts its minute span, a timed audiobook counts only its duration, a
 * recovered session counts fully and is not "unusable".
 *
 * **The cost is real and is written down rather than discovered later.** A heavy reader at
 * four sessions a week for five years is about a thousand rows; the 2000-book sandbox has
 * far more. Each row is six small columns. This is fine now and will not be fine after
 * import (Slice 9), where a library arrives with years of history at once. Filed there,
 * beside the other bulk-write measurements.
 */
export async function getAllSessions(): Promise<ProgressSession[]> {
  return getDb()
    .select({
      format: sessions.format,
      fromPosition: sessions.fromPosition,
      toPosition: sessions.toPosition,
      durationSeconds: sessions.durationSeconds,
      occurredAt: sessions.occurredAt,
      localDay: sessions.localDay,
    })
    .from(sessions)
    .where(isNull(sessions.deletedAt))
}

export interface FinishedReadWithGenre extends FinishedRead, GenreSource {}

/**
 * Every finished read, with its book's genre and the date logic needs.
 *
 * ONE query for two answers — the books number and the genre breakdown — because they must
 * agree. Two queries with two slightly different notions of "finished in 2025" is how a
 * screen ends up saying "12 books" above a chart totalling 11, and the reader is right to
 * trust neither.
 *
 * `lastSessionAt` is the fallback date from `domain/finishes.ts`: a finished read with no
 * `finished_at` is dated by its last session, and one with neither counts as finished in no
 * year at all rather than silently landing in this one.
 */
export async function getFinishedReads(): Promise<FinishedReadWithGenre[]> {
  return getDb()
    .select({
      readId: reads.id,
      status: reads.status,
      finishedAt: reads.finishedAt,
      lastSessionAt: sql<number | null>`max(${sessions.occurredAt})`,
      genre: books.genre,
      categories: books.categories,
    })
    .from(reads)
    .innerJoin(books, eq(books.id, reads.bookId))
    .leftJoin(sessions, and(eq(sessions.readId, reads.id), isNull(sessions.deletedAt)))
    .where(and(isNull(reads.deletedAt), isNull(books.deletedAt), eq(reads.status, 'finished')))
    .groupBy(reads.id)
}
