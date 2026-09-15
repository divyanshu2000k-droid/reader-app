/**
 * src/db/finishedReads.ts
 *
 * EVERY FINISHED READ, WITH WHAT ITS FINISH DATE IS DERIVED FROM.
 *
 * Shared SQL, in `db/` beside the schema like `currentRead.ts`: the finish flow counts "your 31st
 * book this year" with it now, and Stats counts books finished per year with it in Slice 7.
 * Features may not import from each other (CLAUDE.md rule 9).
 *
 * **The year is not decided here.** SQLite's `localtime` is the C library's idea of the zone,
 * which on Android is not reliably the device's, so the year of each finish is bucketed in
 * TypeScript by `domain/finishes.ts` in the device's zone. This returns the two inputs to that
 * rule per read and nothing else.
 *
 * Every read counts, not only a book's current one: a book finished in 2025 and re-read to the
 * end in 2026 is a book in each year. Reads of a removed book do not count.
 */

import { and, eq, isNull, sql } from 'drizzle-orm'

import { getDb } from './client'
import { books, reads, sessions } from './schema'
import type { FinishedRead } from '@/domain/finishes'

export async function getFinishedReads(): Promise<FinishedRead[]> {
  return getDb()
    .select({
      readId: reads.id,
      status: reads.status,
      finishedAt: reads.finishedAt,
      lastSessionAt: sql<number | null>`max(${sessions.occurredAt})`,
    })
    .from(reads)
    .innerJoin(books, and(eq(books.id, reads.bookId), isNull(books.deletedAt)))
    .leftJoin(sessions, and(eq(sessions.readId, reads.id), isNull(sessions.deletedAt)))
    .where(and(eq(reads.status, 'finished'), isNull(reads.deletedAt)))
    .groupBy(reads.id)
}
