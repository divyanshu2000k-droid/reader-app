/**
 * src/db/schema.ts
 *
 * Single source of truth for the data model. Mirrors `docs/03-DATA-MODEL.md`.
 * If you change this file, change that document in the same commit.
 *
 * Invariants that the rest of the codebase depends on:
 *   - Every id is a client-generated UUID. Never an autoincrement integer.
 *     (`sync_queue.id` is the one exception: it is local-only ordering and never syncs.)
 *   - Every timestamp is UTC unix milliseconds. Formatted at render time, never stored
 *     pre-formatted.
 *   - Every delete is soft. `deletedAt` NULL means live.
 *   - `sessions.localDay` is the one stored derivation in the schema. See below.
 *
 * This file legitimately exceeds the 200-line guidance in CLAUDE.md: it is one cohesive
 * declaration, not two jobs in one file.
 */

import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

// ─── THE DOMAIN VOCABULARY ───────────────────────────────────────────────────
// Declared here and attached to their columns with `.$type<>()` below, so
// `Session['format']` IS `SessionFormat` rather than a `string` that happens to agree
// with one. A parallel union next to a bare `text()` column is the hand-written
// duplicate that docs/06-CONVENTIONS.md forbids: it lets a row read from the database
// fail to satisfy a domain type, and the fix at that call site is always a cast.

export type ReadStatus = 'want' | 'reading' | 'finished' | 'dnf'
export type SessionFormat = 'pages' | 'minutes'
export type BookSource = 'google' | 'openlibrary' | 'manual' | 'import'
export type NoteType = 'quote' | 'note'
/** Local only, but the same rule applies: the column carries the union, not `string`. */
export type SyncOperation = 'upsert' | 'delete'

/** Columns every syncable table carries. Spread into each table definition. */
const syncColumns = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
}

// ─── BOOKS ───────────────────────────────────────────────────────────────────
// The work itself. Contains no progress and no dates, deliberately.

export const books = sqliteTable(
  'books',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    /** Nullable. Render nothing when absent, never the string "Unknown". */
    author: text('author'),
    isbn13: text('isbn13'),
    isbn10: text('isbn10'),
    /** Frequently wrong from the APIs. User editable, like every field here. */
    pageCount: integer('page_count'),
    /** Audiobook length in minutes. */
    totalMinutes: integer('total_minutes'),
    coverUrl: text('cover_url'),
    /** Downloaded copy. Covers must survive offline. */
    coverLocalPath: text('cover_local_path'),
    /**
     * A colour the READER chose for the no-cover fallback. NULL means derive it from the
     * title at render (`coverColorFor` in ui/BookCover.tsx), and nothing ever stores the
     * derived one: the same rule as `reads.started_at`. Decided in Slice 2, when books are
     * first written, instead of dropping a column that ships in migration 0000.
     */
    coverColor: text('cover_color'),
    publisher: text('publisher'),
    publishedYear: integer('published_year'),
    source: text('source').$type<BookSource>().notNull().default('manual'),
    /** The upstream id, for a later metadata refresh. */
    sourceId: text('source_id'),
    /**
     * The book's summary, as plain text with paragraphs separated by a blank line: the sources'
     * HTML and Markdown are cleaned on the way in (domain/bookDetails.ts). Reader editable.
     * Added in 0002, Slice 5.
     */
    description: text('description'),
    /**
     * The source's own categories, raw, as a JSON array of strings ("Fiction / Fantasy /
     * General", "genre:fantasy"). Not genres: Slice 7 maps these to a short genre list.
     */
    categories: text('categories'),
    /**
     * Google's preview page, set only when Google says some pages can be read. "Read a sample"
     * opens it in the browser; Slice 11 reads it inside the app.
     */
    previewUrl: text('preview_url'),
    /**
     * When description, categories and preview were last fetched from the source, or null if
     * never. A book is fetched once: a reader who clears a description is not overruled by the
     * next launch, which "only fill what is empty" alone could not tell apart from never fetched.
     */
    detailsCheckedAt: integer('details_checked_at'),
    ...syncColumns,
  },
  (t) => [
    // Partial like every other index here: a deleted book is never listed or searched,
    // so it has no business in the index the library list scans.
    index('idx_books_title')
      .on(t.title)
      .where(sql`deleted_at IS NULL`),
    index('idx_books_isbn')
      .on(t.isbn13)
      .where(sql`deleted_at IS NULL`),
  ],
)

// ─── READS ───────────────────────────────────────────────────────────────────
// One pass through a book. This table is what makes re-reads work: a book with three
// reads has three rows here, each with its own rating and dates. Nothing overwrites
// anything.

export const reads = sqliteTable(
  'reads',
  {
    id: text('id').primaryKey(),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id),
    /** DNF is first class; its pages still count. */
    status: text('status').$type<ReadStatus>().notNull(),
    /** 0.5 to 5.0 in 0.5 steps. */
    rating: real('rating'),
    review: text('review'),
    isPrivate: integer('is_private').notNull().default(1),
    /**
     * NULLABLE STORED OVERRIDE, and the same rule applies to `finishedAt`.
     *
     * NULL means the UI computes MIN(sessions.occurredAt) for started and MAX for
     * finished. A set value means the reader chose it, and the stored value wins.
     *
     * NEVER write a computed value into these columns. Doing so makes a deliberate
     * choice indistinguishable from a cached calculation, which matters the moment the
     * reader adds an earlier session.
     */
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    /** 1 for the first read, 2 for the second, and so on. */
    readNumber: integer('read_number').notNull().default(1),
    ...syncColumns,
  },
  (t) => [
    index('idx_reads_book')
      .on(t.bookId)
      .where(sql`deleted_at IS NULL`),
    // The library list filters by status before anything else.
    index('idx_reads_status')
      .on(t.status)
      .where(sql`deleted_at IS NULL`),
    // One read number per book. Partial, so a deleted read frees its number to be
    // re-used, exactly like the book_shelves pair index.
    uniqueIndex('idx_reads_book_number')
      .on(t.bookId, t.readNumber)
      .where(sql`deleted_at IS NULL`),
  ],
)

// ─── SESSIONS ────────────────────────────────────────────────────────────────
// The atom of the whole system. Append only in practice, always editable in principle.

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    readId: text('read_id')
      .notNull()
      .references(() => reads.id),
    /**
     * THE SINGLE MOST IMPORTANT COLUMN IN THE SCHEMA.
     * UTC unix ms. Defaults to now and is never locked: editable before saving, after
     * saving, and on imported rows. This one column is the fix for four competitor bugs.
     */
    occurredAt: integer('occurred_at').notNull(),
    /**
     * `YYYY-MM-DD`, the calendar day in the device timezone at write time.
     *
     * The one stored derivation in this schema, and a deliberate exception to "derived
     * values are never stored". `date(occurred_at)` buckets in UTC, which misfiles early
     * morning sessions in IST and evening sessions in US timezones, quietly breaking
     * streaks, the pace chart and yearly totals.
     *
     * Written whenever `occurredAt` is written and never otherwise. Every day-bucketed
     * aggregate groups on this column. See DECISIONS.md, 2026-09-03.
     */
    localDay: text('local_day').notNull(),
    /** Lives on the session, not the book, so one book can hold both. */
    format: text('format').$type<SessionFormat>().notNull(),
    fromPosition: integer('from_position'),
    toPosition: integer('to_position'),
    /** Only set for timed sessions. NULL plus isTimed=1 means the session is still open. */
    durationSeconds: integer('duration_seconds'),
    /** 1 if from the timer, 0 if logged manually. */
    isTimed: integer('is_timed').notNull().default(0),
    note: text('note'),
    ...syncColumns,
  },
  (t) => [
    index('idx_sessions_read')
      .on(t.readId)
      .where(sql`deleted_at IS NULL`),
    index('idx_sessions_date')
      .on(t.occurredAt)
      .where(sql`deleted_at IS NULL`),
    // Carries every statistics query, because every day bucket groups on it.
    index('idx_sessions_day')
      .on(t.localDay)
      .where(sql`deleted_at IS NULL`),
  ],
)

// ─── SHELVES ─────────────────────────────────────────────────────────────────
// Free-form tags, many to many. Distinct from `reads.status`: status is where a book is
// in its lifecycle, shelves are the reader's own organisation.

export const shelves = sqliteTable('shelves', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...syncColumns,
})

/**
 * Carries a UUID primary key and the full sync columns rather than a composite key.
 *
 * A composite key would be the tidier relational answer, but it would make a shelf
 * assignment the only row in the app that cannot be soft-deleted, and therefore the only
 * destructive action with no undo. That breaks a non-negotiable rule for the sake of one
 * saved column.
 *
 * The partial unique index is what a composite key was buying: one live assignment per
 * book-and-shelf pair, while still allowing the pair to be re-added after a soft delete.
 */
export const bookShelves = sqliteTable(
  'book_shelves',
  {
    id: text('id').primaryKey(),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id),
    shelfId: text('shelf_id')
      .notNull()
      .references(() => shelves.id),
    addedAt: integer('added_at').notNull(),
    ...syncColumns,
  },
  (t) => [
    uniqueIndex('idx_book_shelves_pair')
      .on(t.bookId, t.shelfId)
      .where(sql`deleted_at IS NULL`),
    index('idx_book_shelves_book')
      .on(t.bookId)
      .where(sql`deleted_at IS NULL`),
  ],
)

// ─── NOTES ───────────────────────────────────────────────────────────────────

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    /** Attached to the BOOK, not the read, so notes survive a re-read. */
    bookId: text('book_id')
      .notNull()
      .references(() => books.id),
    /** Nullable, for provenance only. */
    readId: text('read_id').references(() => reads.id),
    type: text('type').$type<NoteType>().notNull().default('note'),
    content: text('content').notNull(),
    page: integer('page'),
    imagePath: text('image_path'),
    ...syncColumns,
  },
  (t) => [
    index('idx_notes_book')
      .on(t.bookId)
      .where(sql`deleted_at IS NULL`),
  ],
)

// ─── GOALS ───────────────────────────────────────────────────────────────────
// Pages and hours are tracked whether or not a goal exists. Never gate statistics
// behind setting a target.

export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  year: integer('year').notNull(),
  targetBooks: integer('target_books'),
  ...syncColumns,
})

// ─── SYNC QUEUE ──────────────────────────────────────────────────────────────
// Local only. Never syncs. Autoincrement here is correct: it is local ordering, not an
// identity that two devices could collide on.

export const syncQueue = sqliteTable(
  'sync_queue',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    operation: text('operation').$type<SyncOperation>().notNull(),
    queuedAt: integer('queued_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => [index('idx_sync_queue').on(t.queuedAt)],
)

// ─── METADATA CACHE ──────────────────────────────────────────────────────────
// A cache of SEARCH RESULTS, not of library books. When a book is added the relevant
// fields are copied into `books` and that copy is authoritative from then on. Local
// only, never syncs.

export const metadataCache = sqliteTable(
  'metadata_cache',
  {
    source: text('source').notNull(),
    sourceId: text('source_id').notNull(),
    payload: text('payload').notNull(),
    fetchedAt: integer('fetched_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.source, t.sourceId] })],
)

// ─── TYPES ───────────────────────────────────────────────────────────────────
// Derived from the schema. Never hand-write a duplicate of these.

export type Book = typeof books.$inferSelect
export type NewBook = typeof books.$inferInsert
export type Read = typeof reads.$inferSelect
export type NewRead = typeof reads.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Shelf = typeof shelves.$inferSelect
export type NewShelf = typeof shelves.$inferInsert
export type Note = typeof notes.$inferSelect
export type NewNote = typeof notes.$inferInsert
export type BookShelf = typeof bookShelves.$inferSelect
export type NewBookShelf = typeof bookShelves.$inferInsert
export type Goal = typeof goals.$inferSelect
export type NewGoal = typeof goals.$inferInsert
