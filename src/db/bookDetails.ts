/**
 * src/db/bookDetails.ts
 *
 * FILLING IN A BOOK'S DESCRIPTION, CATEGORIES AND PREVIEW LINK from its source, once.
 *
 * - **Books added before Slice 5** have none, and so do Open Library books, whose search carries
 *   no description. Each is fetched from its source (a Google volume, an Open Library work) the
 *   first time it is added or opened while online.
 * - **Once per book, ever:** `details_checked_at` records a fetch that got an answer, even an
 *   answer with nothing in it. A reader who clears a description is not overruled on the next
 *   launch.
 * - **Never over the reader's words:** only empty details are filled (`detailsPatch`).
 * - **Best effort, like covers** (coverFiles.ts): offline, a timeout or a server error writes
 *   nothing and is tried again on a later launch. At most one attempt per book per launch.
 * - **Google needs the key.** Without one, Google books wait rather than being marked checked.
 *
 * In `db/` beside `coverFiles.ts`, the same shape of job: shared by adding a book and by book
 * detail, and features may not import one another.
 */

import { and, eq, isNull } from 'drizzle-orm'

import { getDb } from './client'
import { books } from './schema'
import { updateRow } from './write'
import {
  detailsPatch,
  parseGoogleVolumeDetails,
  parseOpenLibraryWorkDetails,
  type BookDetails,
} from '@/domain/bookDetails'
import { config } from '@/lib/config'
import { now } from '@/lib/dates'
import { OPEN_LIBRARY_USER_AGENT } from '@/lib/openLibrary'

const TIMEOUT_MS = 10_000
const attempted = new Set<string>()

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return (await response.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

async function fetchDetails(source: string, sourceId: string): Promise<BookDetails | null> {
  const id = encodeURIComponent(sourceId)
  if (source === 'google') {
    if (config.googleBooksApiKey === null) return null
    const key = encodeURIComponent(config.googleBooksApiKey)
    return parseGoogleVolumeDetails(
      await getJson(`https://www.googleapis.com/books/v1/volumes/${id}?key=${key}`, {}),
    )
  }
  if (source === 'openlibrary') {
    return parseOpenLibraryWorkDetails(
      await getJson(`https://openlibrary.org/works/${id}.json`, {
        'User-Agent': OPEN_LIBRARY_USER_AGENT,
      }),
    )
  }
  return null
}

/** Fill in `bookId`'s details if they were never fetched. Resolves to whether it wrote. Never throws. */
export async function ensureBookDetails(bookId: string): Promise<boolean> {
  if (attempted.has(bookId)) return false
  attempted.add(bookId)
  try {
    const rows = await getDb()
      .select({
        source: books.source,
        sourceId: books.sourceId,
        description: books.description,
        categories: books.categories,
        previewUrl: books.previewUrl,
        detailsCheckedAt: books.detailsCheckedAt,
      })
      .from(books)
      .where(and(eq(books.id, bookId), isNull(books.deletedAt)))
      .limit(1)
    const book = rows[0]
    if (!book || book.detailsCheckedAt !== null || book.sourceId === null) return false
    const fetched = await fetchDetails(book.source, book.sourceId)
    if (fetched === null) return false
    const saved = await updateRow('books', bookId, detailsPatch(book, fetched, now()))
    return saved.ok
  } catch {
    // Offline, a timeout, a 404: nothing is written, and a later launch tries again.
    return false
  }
}
