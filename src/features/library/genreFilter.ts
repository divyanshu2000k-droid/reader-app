/**
 * src/features/library/genreFilter.ts
 *
 * THE LIBRARY'S GENRE FILTER. Pure, so the rules are asserted rather than eyeballed.
 *
 * ─── WHY THIS FILTERS IN TYPESCRIPT AND NOT IN SQL ───────────────────────────
 *
 * A book's genre is its `genre` column when the reader chose one and a GUESS from
 * `categories` otherwise, and the guessing is a hundred lines of judgement in
 * `domain/genre.ts`. Reimplementing that in a `WHERE` clause would be a second copy of the
 * rule, which is precisely what device check 10 exists to police for the progress
 * aggregates. The rows for the tab are already loaded and in memory for the list; filtering
 * them is a pass over an array the screen is holding anyway.
 *
 * ─── AND WHY ONLY THE GENRES PRESENT ARE OFFERED ─────────────────────────────
 *
 * Sixteen chips above a library of nine books, fourteen of which match nothing, is a filter
 * that makes the screen harder to use. A reader should only be offered a cut that has
 * something behind it.
 */

import { GENRES, effectiveGenre, type Genre } from '@/domain/genre'

/** Just enough of a library row to file it. */
export interface GenreFilterable {
  readonly genre: string | null
  readonly categories: string | null
}

/**
 * The genres actually present in these rows, in the canonical order.
 *
 * `GENRES` order rather than by count: the filter row sits in a fixed place on a screen the
 * reader uses constantly, and chips that reorder themselves as the library changes mean
 * reaching for "Fantasy" and hitting "History". The breakdown on Stats sorts by count
 * because it is a chart being read; this is a control being aimed at.
 */
export function genresPresent(rows: readonly GenreFilterable[]): Genre[] {
  const present = new Set<Genre>()
  for (const row of rows) present.add(effectiveGenre(row.genre, row.categories))
  return GENRES.filter((genre) => present.has(genre))
}

/**
 * The rows for one genre, or all of them.
 *
 * `null` means no filter, and is a different thing from a genre that matches nothing: one
 * shows the whole tab, the other shows an empty tab honestly.
 */
export function filterByGenre<T extends GenreFilterable>(
  rows: readonly T[],
  genre: Genre | null,
): T[] {
  if (genre === null) return [...rows]
  return rows.filter((row) => effectiveGenre(row.genre, row.categories) === genre)
}

/**
 * Whether a chosen filter still makes sense for these rows.
 *
 * The tab's contents change under the filter — a book is finished, removed, or moved to
 * another shelf — and a filter left pointing at a genre with nothing behind it shows an
 * empty list with no visible reason. The screen drops it rather than stranding the reader.
 */
export function filterStillApplies(
  rows: readonly GenreFilterable[],
  genre: Genre | null,
): boolean {
  return genre === null || genresPresent(rows).includes(genre)
}
