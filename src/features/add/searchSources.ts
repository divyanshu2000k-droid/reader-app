/**
 * src/features/add/searchSources.ts
 *
 * THE TWO BOOK DATABASES, as requests and as parsed hits. Pure: no fetch here, so every shape
 * the APIs return is asserted against captured responses (`__tests__/fixtures`).
 *
 * Both parsers take `unknown` and trust nothing. A field of the wrong type is treated as
 * absent rather than cast, because a page count of "272" or an author of `null` reaching the
 * library is how bad metadata becomes a wrong statistic (01-PRODUCT, finding 5).
 *
 * What each source is trusted for (02-ARCHITECTURE, ADR 005):
 *   - **Google Books** returns EDITIONS: one ISBN, one publisher, one page count. Better
 *     covers and metadata. Needs an API key: unkeyed requests were refused outright on
 *     2026-09-14 (429, quota 0), so without a key it is not asked at all.
 *   - **Open Library** returns WORKS: every edition's ISBNs, many publishers, a MEDIAN page
 *     count. Better coverage of older, Indian and self-published titles. So an Open Library
 *     hit carries no ISBN and no publisher of its own: choosing one edition's would be
 *     inventing which edition the reader holds. Its ISBNs are kept only for merging and for
 *     recognising a book already in the library.
 */

import { toIsbn13 } from '@/domain/isbn'

export type SearchSource = 'google' | 'openlibrary'

export interface SearchHit {
  readonly source: SearchSource
  readonly sourceId: string
  readonly title: string
  readonly subtitle: string | null
  readonly authors: readonly string[]
  readonly publisher: string | null
  readonly publishedYear: number | null
  readonly pageCount: number | null
  /** This edition's ISBN-13. Google only; an Open Library work has no single edition. */
  readonly isbn13: string | null
  readonly isbn10: string | null
  /** Every valid ISBN known for this hit, as ISBN-13. For merging and library matching. */
  readonly isbns: readonly string[]
  /** https only. An http cover is blocked by Android's cleartext policy. */
  readonly coverUrl: string | null
}

/** How many results each source is asked for. */
export const RESULTS_PER_SOURCE = 20

/** Open Library asks every client to identify itself (02-ARCHITECTURE, ADR 005). */
export const OPEN_LIBRARY_USER_AGENT = 'Reader/0.1 (Android reading tracker)'

/**
 * Built by hand, not with `URLSearchParams`: React Native's implementation has lagged the web's,
 * and a query string that silently drops a parameter is a search that silently returns less.
 */
function query(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

export function googleBooksUrl(term: string, apiKey: string): string {
  return `https://www.googleapis.com/books/v1/volumes?${query({
    q: term,
    maxResults: String(RESULTS_PER_SOURCE),
    printType: 'books',
    key: apiKey,
  })}`
}

export function openLibraryUrl(term: string): string {
  return `https://openlibrary.org/search.json?${query({
    q: term,
    limit: String(RESULTS_PER_SOURCE),
    fields:
      'key,title,subtitle,author_name,first_publish_year,number_of_pages_median,isbn,cover_i',
  })}`
}

// ─── DEFENSIVE READERS ───────────────────────────────────────────────────────

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

function positiveInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null
}

function strings(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const item of v) {
    const s = str(item)
    if (s !== null && !out.includes(s)) out.push(s)
  }
  return out
}

function year(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v >= 1000 && v <= 9999 ? v : null
  const s = str(v)
  const match = s ? /^(\d{4})/.exec(s) : null
  return match ? Number(match[1]) : null
}

function uniqueIsbns(values: readonly (string | null)[]): string[] {
  const out: string[] = []
  for (const v of values) {
    const isbn = toIsbn13(v)
    if (isbn !== null && !out.includes(isbn)) out.push(isbn)
  }
  return out
}

/** Google hands out http thumbnails with a page-curl effect. https, and no curl. */
function googleCover(links: Record<string, unknown> | null): string | null {
  const url = str(links?.thumbnail) ?? str(links?.smallThumbnail)
  if (url === null) return null
  return url.replace(/^http:\/\//, 'https://').replace(/&edge=curl/g, '')
}

// ─── PARSERS ─────────────────────────────────────────────────────────────────

export function parseGoogleBooks(json: unknown): SearchHit[] {
  const items = obj(json)?.items
  if (!Array.isArray(items)) return []
  const hits: SearchHit[] = []
  for (const raw of items) {
    const item = obj(raw)
    const id = str(item?.id)
    const info = obj(item?.volumeInfo)
    const title = str(info?.title)
    if (id === null || info === null || title === null) continue

    let isbn13: string | null = null
    let isbn10: string | null = null
    const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : []
    for (const rawId of identifiers) {
      const entry = obj(rawId)
      const value = str(entry?.identifier)
      if (value === null) continue
      if (entry?.type === 'ISBN_13' && toIsbn13(value) === value.replace(/[\s-]/g, '')) {
        isbn13 = value.replace(/[\s-]/g, '')
      }
      if (entry?.type === 'ISBN_10' && toIsbn13(value) !== null) {
        isbn10 = value.replace(/[\s-]/g, '').toUpperCase()
      }
    }
    // An edition that lists only its ISBN-10 still has an ISBN-13.
    isbn13 = isbn13 ?? toIsbn13(isbn10)

    hits.push({
      source: 'google',
      sourceId: id,
      title,
      subtitle: str(info.subtitle),
      authors: strings(info.authors),
      publisher: str(info.publisher),
      publishedYear: year(info.publishedDate),
      pageCount: positiveInt(info.pageCount),
      isbn13,
      isbn10,
      isbns: uniqueIsbns([isbn13, isbn10]),
      coverUrl: googleCover(obj(info.imageLinks)),
    })
  }
  return hits
}

export function parseOpenLibrary(json: unknown): SearchHit[] {
  const docs = obj(json)?.docs
  if (!Array.isArray(docs)) return []
  const hits: SearchHit[] = []
  for (const raw of docs) {
    const doc = obj(raw)
    const key = str(doc?.key)
    const title = str(doc?.title)
    if (doc === null || key === null || title === null) continue
    const coverId = positiveInt(doc.cover_i)
    hits.push({
      source: 'openlibrary',
      sourceId: key.replace(/^\/works\//, ''),
      title,
      subtitle: str(doc.subtitle),
      authors: strings(doc.author_name),
      publisher: null,
      publishedYear: year(doc.first_publish_year),
      pageCount: positiveInt(doc.number_of_pages_median),
      isbn13: null,
      isbn10: null,
      isbns: uniqueIsbns(strings(doc.isbn)),
      coverUrl:
        coverId === null ? null : `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`,
    })
  }
  return hits
}
