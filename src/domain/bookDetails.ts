/**
 * src/domain/bookDetails.ts
 *
 * A BOOK'S DESCRIPTION, CATEGORIES AND PREVIEW LINK, from what the sources send. Pure, and tested
 * on captured responses (`__tests__/fixtures`).
 *
 * Shared by adding a book (features/add, from a search result) and by filling in books already in
 * the library (`db/bookDetails.ts`). Features may not import one another.
 *
 * ─── WHAT THE SOURCES ACTUALLY SEND ──────────────────────────────────────────
 *
 * - **Google, one volume:** the description is HTML: `<b>`, `<i>`, `<br>`, entities, and a
 *   publisher's `<b>______</b>` rule between the praise and the synopsis.
 * - **Google, search:** the same text with the tags already stripped.
 * - **Open Library, a work:** the description is Markdown (`**bold**`, `*italic*`, links), as a
 *   string or as `{ type, value }`. It often ends in a `----------` rule followed by "Also
 *   contained in:" and a list of links, which is not about the book.
 * - **Categories:** Google's are "Fiction / Fantasy / General"; Open Library's subjects run from
 *   "genre:fantasy" to "nyt:combined-print-and-e-book-fiction=2020-10-04". Kept raw here, capped;
 *   Slice 7 maps them to genres.
 *
 * Stored as plain text, paragraphs separated by one blank line, so the reader's own edits in
 * Edit details are the same kind of text as what came from a source.
 */

import type { PatchFor } from '@/db/write'
import type { UnixMs } from '@/lib/dates'

/** A summary, not the book. Longer text is cut at a word, with an ellipsis. */
export const DESCRIPTION_MAX_LENGTH = 4000

/** Enough to map a genre from; Open Library lists up to hundreds of subjects per work. */
export const CATEGORIES_MAX = 12

export interface BookDetails {
  readonly description: string | null
  readonly categories: readonly string[]
  readonly previewUrl: string | null
}

export const NO_DETAILS: BookDetails = { description: null, categories: [], previewUrl: null }

// ─── DESCRIPTION ─────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      const code = Number.parseInt(name.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

/**
 * The sources' HTML or Markdown as plain paragraphs, or null when nothing is left. Never throws
 * on odd input: a description is a nicety, and a bad one is dropped, not shown broken.
 */
export function cleanDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let text = raw.replace(/\r\n?/g, '\n')

  // HTML: line breaks and paragraphs become newlines, every other tag goes.
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
  text = decodeEntities(text)

  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/[ \t]+/g, ' ').trim()
    // Open Library's "----------" introduces "Also contained in:" and "Contains:" lists.
    if (/^-{3,}$/.test(line)) break
    // A publisher's rule of underscores or equals signs separates, and says nothing.
    if (/^[_=*~]{3,}$/.test(line)) continue
    lines.push(line)
  }
  text = lines.join('\n')

  // Markdown: links keep their text, reference links and their footnotes go, emphasis goes.
  text = text
    .replace(/\(\[[^\]]*\]\[\d+\]\)/g, '')
    .replace(/^\[\d+\]:\s*\S+.*$/gm, '')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)[^)]*\)/g, '$1')
    // Bold can wrap italics ("**From the *New York Times* author**"), so its markers go first.
    .replace(/\*\*/g, '')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, '$1$2')

  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (text === '') return null
  if (text.length <= DESCRIPTION_MAX_LENGTH) return text
  const cut = text.slice(0, DESCRIPTION_MAX_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

// ─── CATEGORIES ──────────────────────────────────────────────────────────────

/** Trimmed, de-duplicated (ignoring case), capped, in the source's order. */
export function normaliseCategories(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const trimmed = value.replace(/\s+/g, ' ').trim()
    const key = trimmed.toLowerCase()
    if (trimmed === '' || seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
    if (out.length === CATEGORIES_MAX) break
  }
  return out
}

/** For `books.categories`: a JSON array, or null for none. */
export function serialiseCategories(categories: readonly string[]): string | null {
  return categories.length === 0 ? null : JSON.stringify(categories)
}

/** From `books.categories`. A column that is not a JSON array of strings reads as none. */
export function parseCategories(stored: string | null): string[] {
  if (stored === null) return []
  try {
    return normaliseCategories(JSON.parse(stored) as unknown)
  } catch {
    return []
  }
}

// ─── PREVIEW ─────────────────────────────────────────────────────────────────

/**
 * Google's preview page for a volume, only when Google says pages can be read. Built from the id
 * rather than kept from `previewLink`, which carries the reader's search words (`dq=`) and a
 * country domain.
 */
export function googlePreviewUrl(volumeId: string, viewability: unknown): string | null {
  if (viewability !== 'PARTIAL' && viewability !== 'ALL_PAGES') return null
  if (!/^[\w-]+$/.test(volumeId)) return null
  return `https://books.google.com/books?id=${volumeId}&printsec=frontcover`
}

// ─── PARSERS ─────────────────────────────────────────────────────────────────

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

/** `GET /books/v1/volumes/{id}`, or one item of a search. */
export function parseGoogleVolumeDetails(json: unknown): BookDetails {
  const item = obj(json)
  const info = obj(item?.volumeInfo)
  const id = typeof item?.id === 'string' ? item.id : null
  if (info === null || id === null) return NO_DETAILS
  return {
    description: cleanDescription(info.description),
    categories: normaliseCategories(info.categories),
    previewUrl: googlePreviewUrl(id, obj(item?.accessInfo)?.viewability),
  }
}

/** `GET https://openlibrary.org/works/{id}.json`. Open Library has no previews to link to. */
export function parseOpenLibraryWorkDetails(json: unknown): BookDetails {
  const work = obj(json)
  if (work === null) return NO_DETAILS
  const raw = work.description
  const description = cleanDescription(typeof raw === 'string' ? raw : obj(raw)?.value)
  return { description, categories: normaliseCategories(work.subjects), previewUrl: null }
}

// ─── WRITING ─────────────────────────────────────────────────────────────────

export interface StoredDetails {
  readonly description: string | null
  readonly categories: string | null
  readonly previewUrl: string | null
}

/**
 * What a fetch writes: each detail the book does not already have, and the time it was checked.
 * A value already there, from the reader or an earlier fetch, is never replaced.
 */
export function detailsPatch(
  stored: StoredDetails,
  fetched: BookDetails,
  checkedAt: UnixMs,
): PatchFor<'books'> {
  const patch: PatchFor<'books'> = { detailsCheckedAt: checkedAt }
  if (stored.description === null && fetched.description !== null) {
    patch.description = fetched.description
  }
  const categories = serialiseCategories(fetched.categories)
  if (stored.categories === null && categories !== null) patch.categories = categories
  if (stored.previewUrl === null && fetched.previewUrl !== null) {
    patch.previewUrl = fetched.previewUrl
  }
  return patch
}
