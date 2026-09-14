/**
 * src/features/add/searchMerge.ts
 *
 * ONE LIST FROM TWO DATABASES. Pure, so the merge, the ranking and the library match are
 * asserted rather than eyeballed.
 *
 * - **Only results that match what was typed.** Open Library's search is fuzzy: "piranesi
 *   clarke" returned Gibbon's Decline and Fall and A Christmas Carol, matching neither word.
 *   "Searches return books not containing both words" is the most cited Goodreads complaint
 *   (01-PRODUCT, finding 4). A result matching no word is dropped; one matching every word
 *   ranks above one matching some.
 * - **Merged by ISBN, then by title and first author**, Google first (ADR 005). A merged result
 *   keeps Google's edition data and fills its gaps (cover, pages, year) from Open Library.
 * - **Already in the library** is recognised by ISBN, then by title and author, so a reader is
 *   offered their own book rather than a duplicate. The same rule import uses (04-SCREENS, C).
 */

import type { SearchHit, SearchSource } from './searchSources'
import { toIsbn13 } from '@/domain/isbn'
import { normaliseText } from '@/domain/searchText'

export interface SearchResult {
  /** Stable across renders: the first source's id. */
  readonly key: string
  readonly source: SearchSource
  readonly sourceId: string
  readonly title: string
  readonly subtitle: string | null
  readonly authors: readonly string[]
  readonly publisher: string | null
  readonly publishedYear: number | null
  readonly pageCount: number | null
  readonly isbn13: string | null
  readonly isbn10: string | null
  readonly isbns: readonly string[]
  readonly coverUrl: string | null
  /** Every source that returned this book. */
  readonly sources: readonly SearchSource[]
}

/** Words too common to count as a match on their own. */
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'by', 'in', 'on', 'to', 'for'])

/** Lowercase, accents removed, punctuation to spaces (domain/searchText.ts). */
export const normalise = normaliseText

export function queryTerms(term: string): string[] {
  const words = normalise(term)
    .split(' ')
    .filter((w) => w.length > 0)
  const meaningful = words.filter((w) => !STOP_WORDS.has(w))
  return [...new Set(meaningful.length > 0 ? meaningful : words)]
}

type Matchable = Pick<SearchHit, 'title' | 'subtitle' | 'authors'>

/** How many of the query's words this hit contains, in its title, subtitle or authors. */
function matchCount(hit: Matchable, terms: readonly string[]): number {
  const words = new Set(
    normalise([hit.title, hit.subtitle ?? '', ...hit.authors].join(' ')).split(' '),
  )
  return terms.filter((t) => words.has(t) || [...words].some((w) => w.startsWith(t))).length
}

function sameWork(a: { title: string; authors: readonly string[] }, b: typeof a): boolean {
  const authorA = a.authors[0]
  const authorB = b.authors[0]
  return (
    normalise(a.title) === normalise(b.title) &&
    authorA !== undefined &&
    authorB !== undefined &&
    normalise(authorA) === normalise(authorB)
  )
}

function fromHit(hit: SearchHit): SearchResult {
  return { ...hit, key: `${hit.source}:${hit.sourceId}`, sources: [hit.source] }
}

/** Google's edition, with the gaps Open Library can fill. */
function fill(result: SearchResult, extra: SearchHit): SearchResult {
  return {
    ...result,
    pageCount: result.pageCount ?? extra.pageCount,
    publishedYear: result.publishedYear ?? extra.publishedYear,
    coverUrl: result.coverUrl ?? extra.coverUrl,
    authors: result.authors.length > 0 ? result.authors : extra.authors,
    isbns: [...new Set([...result.isbns, ...extra.isbns])],
    sources: result.sources.includes(extra.source)
      ? result.sources
      : [...result.sources, extra.source],
  }
}

/**
 * Merge whatever each source has returned so far. Either may be null: still loading, failed,
 * or not asked. Results render as they arrive (04-SCREENS, Journey D).
 */
export function mergeResults(
  term: string,
  google: readonly SearchHit[] | null,
  openLibrary: readonly SearchHit[] | null,
): SearchResult[] {
  const isbnQuery = toIsbn13(term)
  const terms = queryTerms(term)
  const relevance = (hit: SearchHit): number =>
    isbnQuery !== null ? (hit.isbns.includes(isbnQuery) ? 1 : 0) : matchCount(hit, terms)

  const merged: { result: SearchResult; score: number; order: number }[] = []
  let order = 0

  for (const hit of google ?? []) {
    const score = relevance(hit)
    if (score === 0) continue
    // Two Google volumes of one edition: keep the first.
    const duplicate = merged.find((m) => hit.isbn13 !== null && m.result.isbn13 === hit.isbn13)
    if (duplicate) continue
    merged.push({ result: fromHit(hit), score, order: order++ })
  }

  for (const hit of openLibrary ?? []) {
    const score = relevance(hit)
    if (score === 0) continue
    const match = merged.find(
      (m) => m.result.isbns.some((isbn) => hit.isbns.includes(isbn)) || sameWork(m.result, hit),
    )
    if (match) {
      match.result = fill(match.result, hit)
      match.score = Math.max(match.score, score)
      continue
    }
    merged.push({ result: fromHit(hit), score, order: order++ })
  }

  return merged.sort((a, b) => b.score - a.score || a.order - b.order).map((m) => m.result)
}

/**
 * Results remembered from earlier searches, ranked for a new term by the same rule. What the
 * Add screen shows offline: books the reader has searched for before.
 */
export function rankResults(term: string, results: readonly SearchResult[]): SearchResult[] {
  const isbnQuery = toIsbn13(term)
  const terms = queryTerms(term)
  return results
    .map((result, order) => ({
      result,
      order,
      score:
        isbnQuery !== null
          ? result.isbns.includes(isbnQuery)
            ? 1
            : 0
          : matchCount(result, terms),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((r) => r.result)
}

/** A remembered result read back from `metadata_cache`, or null if it is not one. */
export function parseRememberedResult(payload: string): SearchResult | null {
  let value: unknown
  try {
    value = JSON.parse(payload)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const r = value as Record<string, unknown>
  const isText = (v: unknown) => typeof v === 'string'
  const isTextOrNull = (v: unknown) => v === null || typeof v === 'string'
  const isCountOrNull = (v: unknown) =>
    v === null || (typeof v === 'number' && Number.isInteger(v))
  const isTexts = (v: unknown) => Array.isArray(v) && v.every(isText)
  const valid =
    isText(r.key) &&
    (r.source === 'google' || r.source === 'openlibrary') &&
    isText(r.sourceId) &&
    isText(r.title) &&
    isTextOrNull(r.subtitle) &&
    isTexts(r.authors) &&
    isTextOrNull(r.publisher) &&
    isCountOrNull(r.publishedYear) &&
    isCountOrNull(r.pageCount) &&
    isTextOrNull(r.isbn13) &&
    isTextOrNull(r.isbn10) &&
    isTexts(r.isbns) &&
    isTextOrNull(r.coverUrl) &&
    Array.isArray(r.sources) &&
    r.sources.every((s) => s === 'google' || s === 'openlibrary')
  // Checked field by field above; this is the one place the shape is asserted.
  return valid ? (value as SearchResult) : null
}

export interface LibraryBookRef {
  readonly id: string
  readonly title: string
  readonly author: string | null
  readonly isbn13: string | null
}

/** The live library book this result already is, or null. ISBN first, then title and author. */
export function findInLibrary(
  result: SearchResult,
  library: readonly LibraryBookRef[],
): string | null {
  const byIsbn = library.find((b) => b.isbn13 !== null && result.isbns.includes(b.isbn13))
  if (byIsbn) return byIsbn.id
  const byWork = library.find((b) =>
    sameWork(result, { title: b.title, authors: b.author ? [b.author] : [] }),
  )
  return byWork?.id ?? null
}

/** "Bloomsbury · 2020 · 245pp", from what is known, never "Unknown". */
export function resultDetail(result: SearchResult): string | null {
  const parts = [
    result.publisher,
    result.publishedYear === null ? null : String(result.publishedYear),
    result.pageCount === null ? null : `${result.pageCount}pp`,
  ].filter((p): p is string => p !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}
