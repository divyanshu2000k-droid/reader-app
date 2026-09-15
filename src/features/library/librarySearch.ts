/**
 * src/features/library/librarySearch.ts
 *
 * SEARCH YOUR LIBRARY, separate from searching the internet (05-BUILD-PLAN, Slice 4;
 * LibrarySearch.dc.html). Pure, so matching and the badge are asserted.
 *
 * - **Matched in TypeScript, not SQL `LIKE`.** SQLite's LIKE ignores case only for ASCII and
 *   never ignores accents, so "toibin" would not find "Tóibín". The whole library's titles and
 *   authors are small (2000 books is well under a megabyte), so they are matched here with the
 *   same normalising the internet search uses, and only the matches load their progress.
 * - **Every word must match**, in the title or the author, a prefix counting ("pow" finds
 *   Powers). A library search that returns books missing a word is the Goodreads complaint again.
 */

import type { ReadStatus } from '@/db/schema'
import { effectiveFinishedAt } from '@/domain/finishes'
import { normaliseText, textWords } from '@/domain/searchText'
import { localYearOf, type UnixMs } from '@/lib/dates'

export interface IndexedBook {
  readonly bookId: string
  readonly title: string
  readonly author: string | null
  readonly status: ReadStatus
}

const words = textWords

/** Books whose title and author hold every word of `term`, title matches first. */
export function matchLibrary(
  index: readonly IndexedBook[],
  term: string,
  scope: ReadStatus | null,
  limit: number,
): string[] {
  const terms = words(term)
  if (terms.length === 0) return []
  const has = (haystack: readonly string[], t: string) => haystack.some((w) => w.startsWith(t))
  const scored: { bookId: string; titleHits: number; order: number }[] = []
  index.forEach((book, order) => {
    if (scope !== null && book.status !== scope) return
    const title = words(book.title)
    const author = words(book.author ?? '')
    if (!terms.every((t) => has(title, t) || has(author, t))) return
    scored.push({
      bookId: book.bookId,
      titleHits: terms.filter((t) => has(title, t)).length,
      order,
    })
  })
  return scored
    .sort((a, b) => b.titleHits - a.titleHits || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.bookId)
}

export interface HighlightPart {
  readonly text: string
  readonly match: boolean
}

/**
 * `text` split into matched and unmatched runs, for the design's gold "Powers". A word is
 * highlighted when it starts with a search word, compared without case or accents.
 */
export function highlight(text: string, term: string): HighlightPart[] {
  const terms = words(term)
  if (terms.length === 0) return [{ text, match: false }]
  const parts: HighlightPart[] = []
  for (const piece of text.split(/(\s+)/)) {
    if (piece.length === 0) continue
    const norm = normaliseText(piece)
    const match =
      norm.length > 0 && terms.some((t) => norm.split(' ').some((w) => w.startsWith(t)))
    const last = parts[parts.length - 1]
    if (last && last.match === match)
      parts[parts.length - 1] = { text: last.text + piece, match }
    else parts.push({ text: piece, match })
  }
  return parts
}

/** "READING · 42%", "FINISHED · 2024", "WANT TO READ", "DNF". */
export function statusBadge(
  status: ReadStatus,
  progressLabel: string | null,
  finishedAt: UnixMs | null,
  lastSessionAt: UnixMs | null,
): string {
  switch (status) {
    case 'reading':
      return progressLabel ? `READING · ${progressLabel.toUpperCase()}` : 'READING'
    case 'finished': {
      // One rule for every screen (domain/finishes.ts).
      const when = effectiveFinishedAt({ status, finishedAt, lastSessionAt })
      return when === null ? 'FINISHED' : `FINISHED · ${localYearOf(when)}`
    }
    case 'want':
      return 'WANT TO READ'
    case 'dnf':
      return 'DNF'
  }
}
