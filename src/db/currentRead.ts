/**
 * src/db/currentRead.ts
 *
 * WHICH READ IS A BOOK'S CURRENT ONE: its live read with the highest `read_number`.
 *
 * A book with a finished first read and a second read in progress has two `reads` rows. The
 * Library listed rows by their own status, so that book appeared on BOTH the Finished and the
 * Reading tabs. A re-read started while the book was already being read put it on Reading
 * twice. The 2000-book seed held about 140 of these, and the Finished tab measured in Slice 2
 * contained them. A book's tab is its current read's status, and every list of books filters
 * with this.
 *
 * In `db/` beside the schema, because it is shared SQL: the Library needs it, and so will
 * Stats and search. Device check 12 holds it to "one row per book".
 */

import { sql } from 'drizzle-orm'

import { reads } from './schema'

/** True for the newest live read of its book. Uses the partial unique index on (book, number). */
export const isCurrentRead = sql`${reads.readNumber} = (
  select max(r2.read_number) from reads r2
  where r2.book_id = ${reads.bookId} and r2.deleted_at is null
)`
