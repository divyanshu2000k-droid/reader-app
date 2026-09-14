/**
 * src/features/add/queries.ts
 *
 * All SQL for adding a book and editing its details. Every write goes through `db/write.ts`.
 */

import { and, desc, eq, isNull, like, or } from 'drizzle-orm'

import {
  firstReadRow,
  manualBookRow,
  type AddStatus,
  type BookForm,
  type StoredBookFields,
} from './bookForm'
import {
  parseRememberedResult,
  rankResults,
  queryTerms,
  type LibraryBookRef,
  type SearchResult,
} from './searchMerge'
import { getDb } from '@/db/client'
import { ensureLocalCover } from '@/db/coverFiles'
import { books, metadataCache } from '@/db/schema'
import {
  cacheSearchResults,
  updateRow,
  writeTogether,
  type PatchFor,
  type RowFor,
  type WriteOutcome,
} from '@/db/write'
import { injectedError, isFaultArmed } from '@/lib/faults'
import { newId } from '@/lib/ids'
import { appError, err, ok, type Result } from '@/lib/result'

/** Every live book, reduced to what recognising a search result needs. */
export async function getLibraryRefs(): Promise<LibraryBookRef[]> {
  return getDb()
    .select({ id: books.id, title: books.title, author: books.author, isbn13: books.isbn13 })
    .from(books)
    .where(isNull(books.deletedAt))
}

/** Remember results permanently. A failure here is not the reader's problem: search worked. */
export async function rememberResults(results: readonly SearchResult[]): Promise<void> {
  await cacheSearchResults(
    results.map((r) => ({
      source: r.source,
      sourceId: r.sourceId,
      payload: JSON.stringify(r),
    })),
  )
}

/** How many remembered results are read back to rank, at most. */
const REMEMBERED_LIMIT = 200

/**
 * Results remembered from earlier searches that match `term`: what search can still show
 * offline. Narrowed in SQL by the first word, then ranked by every word in TypeScript, with the
 * same rule the live search uses.
 */
export async function searchRemembered(term: string): Promise<SearchResult[]> {
  const [first] = queryTerms(term)
  if (first === undefined) return []
  const pattern = `%${first.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const rows = await getDb()
    .select({ payload: metadataCache.payload })
    .from(metadataCache)
    .where(or(like(metadataCache.payload, pattern), like(metadataCache.sourceId, pattern)))
    .orderBy(desc(metadataCache.fetchedAt))
    .limit(REMEMBERED_LIMIT)
  const parsed = rows
    .map((r) => parseRememberedResult(r.payload))
    .filter((r): r is SearchResult => r !== null)
  return rankResults(term, parsed)
}

function injectedSaveFailure() {
  return err(
    appError('recoverable', 'Could not add that', {
      safe: 'Your library was not changed. This failure was forced from Settings.',
      cause: injectedError('bookSave'),
    }),
  )
}

/** The `books` row for a search result. The copy is the reader's from here on (03-DATA-MODEL). */
export function bookRowFromResult(result: SearchResult, id: string): RowFor<'books'> {
  return {
    id,
    title: result.title,
    author: result.authors.length > 0 ? result.authors.join(', ') : null,
    isbn13: result.isbn13,
    isbn10: result.isbn10,
    pageCount: result.pageCount,
    totalMinutes: null,
    coverUrl: result.coverUrl,
    coverLocalPath: null,
    coverColor: null,
    publisher: result.publisher,
    publishedYear: result.publishedYear,
    source: result.source,
    sourceId: result.sourceId,
  }
}

/**
 * Add a search result: the book and its first read, in one transaction. The cover downloads
 * afterwards, in the background, and never decides whether the add succeeded.
 */
export async function addFromSearch(
  result: SearchResult,
  status: AddStatus,
): Promise<Result<{ bookId: string }>> {
  if (isFaultArmed('bookSave')) return injectedSaveFailure()
  const bookId = newId()
  const saved = await writeTogether([
    { table: 'books', values: bookRowFromResult(result, bookId) },
    { table: 'reads', values: firstReadRow(newId(), bookId, status) },
  ])
  if (!saved.ok) return saved
  void ensureLocalCover(bookId, result.coverUrl)
  return ok({ bookId })
}

/** Add a book by hand: the book and its first read, in one transaction. */
export async function addManually(
  form: BookForm,
  status: AddStatus,
): Promise<Result<{ bookId: string }>> {
  if (isFaultArmed('bookSave')) return injectedSaveFailure()
  const bookId = newId()
  const saved = await writeTogether([
    { table: 'books', values: manualBookRow(form, bookId) },
    { table: 'reads', values: firstReadRow(newId(), bookId, status) },
  ])
  return saved.ok ? ok({ bookId }) : saved
}

export interface EditableBook extends StoredBookFields {
  readonly id: string
  readonly coverUrl: string | null
  readonly coverLocalPath: string | null
}

/** A live book's editable fields, or null when it is not in the library. */
export async function getEditableBook(bookId: string): Promise<EditableBook | null> {
  const rows = await getDb()
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      pageCount: books.pageCount,
      totalMinutes: books.totalMinutes,
      publisher: books.publisher,
      publishedYear: books.publishedYear,
      isbn13: books.isbn13,
      isbn10: books.isbn10,
      coverColor: books.coverColor,
      coverUrl: books.coverUrl,
      coverLocalPath: books.coverLocalPath,
    })
    .from(books)
    .where(and(eq(books.id, bookId), isNull(books.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

/** Save an edit. An empty patch writes and queues nothing. */
export async function updateBookDetails(
  bookId: string,
  patch: PatchFor<'books'>,
): Promise<Result<WriteOutcome>> {
  if (isFaultArmed('bookSave')) return injectedSaveFailure()
  return updateRow('books', bookId, patch)
}
