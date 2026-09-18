/**
 * src/features/notes/queries.ts
 *
 * All SQL for notes and quotes. Reads here; every write goes through `db/write.ts`, which
 * enqueues the sync in the same transaction.
 *
 * **Notes are read by book, never by read.** That is the whole point of the column: a quote
 * captured during a first read is still there during a third. Nothing in this file joins
 * `reads`, and `read_id` is written but never filtered on.
 */

import { and, desc, eq, isNull } from 'drizzle-orm'

import type { NoteContext, StoredNote } from './noteForm'
import { getDb } from '@/db/client'
import { books, metadataCache, notes, reads, sessions } from '@/db/schema'
import {
  clearDraft,
  restoreRow,
  saveDraft,
  softDelete,
  updateRow,
  writeRow,
  type PatchFor,
  type RowFor,
  type WriteOutcome,
} from '@/db/write'
import { currentPosition } from '@/domain/progress'
import { isAudiobook } from '@/domain/progressDisplay'
import type { Result } from '@/lib/result'

export interface NoteBook {
  readonly id: string
  readonly title: string
  readonly author: string | null
  readonly pageCount: number | null
}

export interface NoteEntry extends StoredNote {
  readonly createdAt: number
}

export interface NotesForBook {
  readonly book: NoteBook
  readonly notes: readonly NoteEntry[]
}

/**
 * Every live note of a book, newest first, with the book itself. Null when the book is not
 * in the library, which is an ordinary answer with its own screen.
 *
 * `created_at` orders, not `updated_at`: fixing a typo in an old quote should not move it to
 * the top of the list past notes written since.
 */
export async function getNotesForBook(bookId: string): Promise<NotesForBook | null> {
  const found = await getDb()
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      pageCount: books.pageCount,
    })
    .from(books)
    .where(and(eq(books.id, bookId), isNull(books.deletedAt)))
    .limit(1)
  const book = found[0]
  if (!book) return null
  const rows = await getDb()
    .select({
      id: notes.id,
      type: notes.type,
      content: notes.content,
      page: notes.page,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .where(and(eq(notes.bookId, bookId), isNull(notes.deletedAt)))
    .orderBy(desc(notes.createdAt), desc(notes.id))
  return { book, notes: rows }
}

/**
 * What the editor needs to open for a new note: the book, its current read for provenance,
 * and where the reader has got to.
 *
 * The current read is the live read with the highest number (db/currentRead.ts's rule). A
 * book with no live read still takes notes — `read_id` is nullable and only provenance.
 */
export async function getNoteContext(bookId: string): Promise<{
  readonly book: NoteBook
  readonly context: NoteContext
} | null> {
  const found = await getDb()
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      pageCount: books.pageCount,
      totalMinutes: books.totalMinutes,
    })
    .from(books)
    .where(and(eq(books.id, bookId), isNull(books.deletedAt)))
    .limit(1)
  const book = found[0]
  if (!book) return null

  const currentReads = await getDb()
    .select({ id: reads.id })
    .from(reads)
    .where(and(eq(reads.bookId, bookId), isNull(reads.deletedAt)))
    .orderBy(desc(reads.readNumber))
    .limit(1)
  const readId = currentReads[0]?.id ?? null

  const positions =
    readId === null
      ? []
      : await getDb()
          .select({
            format: sessions.format,
            fromPosition: sessions.fromPosition,
            toPosition: sessions.toPosition,
            durationSeconds: sessions.durationSeconds,
            occurredAt: sessions.occurredAt,
            localDay: sessions.localDay,
          })
          .from(sessions)
          .where(and(eq(sessions.readId, readId), isNull(sessions.deletedAt)))
  const page = currentPosition(positions, 'pages')
  const minute = currentPosition(positions, 'minutes')
  // The ONE definition of an audiobook (domain/progressDisplay.ts). An audiobook has no
  // pages, and `notes.page` means a page, so it is offered none.
  const audio = isAudiobook({ totalMinutes: book.totalMinutes, page, minute })

  return {
    book: { id: book.id, title: book.title, author: book.author, pageCount: book.pageCount },
    context: { bookId, readId, currentPage: page, hasPages: !audio },
  }
}

/** One note for the editor. Null when it is gone, or its book has been removed. */
export async function getNote(
  noteId: string,
): Promise<{ readonly note: StoredNote; readonly book: NoteBook } | null> {
  const rows = await getDb()
    .select({
      note: { id: notes.id, type: notes.type, content: notes.content, page: notes.page },
      book: {
        id: books.id,
        title: books.title,
        author: books.author,
        pageCount: books.pageCount,
      },
    })
    .from(notes)
    .innerJoin(books, eq(notes.bookId, books.id))
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt), isNull(books.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

// ─── WRITES ──────────────────────────────────────────────────────────────────

export async function createNote(row: RowFor<'notes'>): Promise<Result<void>> {
  return writeRow('notes', row)
}

/** An empty patch writes nothing and queues nothing. */
export async function updateNote(
  noteId: string,
  patch: PatchFor<'notes'>,
): Promise<Result<WriteOutcome>> {
  return updateRow('notes', noteId, patch)
}

/** Soft. The toast's Undo is `restoreNote`. */
export async function deleteNote(noteId: string): Promise<Result<WriteOutcome>> {
  return softDelete('notes', noteId)
}

/** Refused, with the reason, if the note's book has been removed since. */
export async function restoreNote(noteId: string): Promise<Result<WriteOutcome>> {
  return restoreRow('notes', noteId)
}

// ─── THE DRAFT ───────────────────────────────────────────────────────────────

/**
 * The stored draft for this editor, or null. Local only: `metadata_cache` never syncs, so a
 * thought abandoned on one phone does not appear on another.
 */
export async function readDraft(source: string, key: string): Promise<string | null> {
  const rows = await getDb()
    .select({ payload: metadataCache.payload })
    .from(metadataCache)
    .where(and(eq(metadataCache.source, source), eq(metadataCache.sourceId, key)))
    .limit(1)
  return rows[0]?.payload ?? null
}

export { clearDraft, saveDraft }
