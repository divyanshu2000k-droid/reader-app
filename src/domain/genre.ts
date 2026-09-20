/**
 * src/domain/genre.ts
 *
 * ONE GENRE PER BOOK, from whatever the source happened to say.
 *
 * `books.categories` is the source's raw list, and it is a mess. From real captures and the
 * sandbox library on 2026-09-19:
 *
 *   Google Books   "Fiction", "Social Science", "Performing Arts", "Hindi fiction",
 *                  "Fiction / Fantasy / General", "Indic literature", "Indonesia"
 *   Open Library   "genre:fantasy", "form:novel", "English literature", "Labyrinths",
 *                  "Dwellings", "Dead", "Money", "Consumption (Economics)", "Ethics",
 *                  "nyt:combined-print-and-e-book-fiction=2020-10-04",
 *                  "New York Times bestseller", "Accessible book"
 *
 * So this is not a lookup table, it is a small pile of judgement, and the judgement is here
 * in one pure function rather than spread across a query and a chart.
 *
 * ─── THE THREE RULES ─────────────────────────────────────────────────────────
 *
 * 1. **Specific beats general.** `["Fiction", "Fantasy"]` is Fantasy. A book that says only
 *    "Fiction" is Fiction. Every shelf in the list below is tried in order, and the general
 *    buckets are last.
 * 2. **Noise is dropped, not guessed at.** "Accessible book", "New York Times bestseller"
 *    and "In library" say nothing about what the book is about. Worse,
 *    `nyt:combined-print-and-e-book-fiction=2020-10-04` CONTAINS the word "fiction" and
 *    would file a cookbook under Fiction if it were read naively. Anything holding `=` or a
 *    known catalogue prefix is discarded before matching.
 * 3. **"Other" is an honest answer.** A book whose categories are "Dwellings" and
 *    "Labyrinths" has no genre we can infer, and inventing one is worse than admitting it.
 *    The reader can set it themselves in Edit details, and their answer always wins.
 *
 * ─── WHY THE READER'S ANSWER IS SEPARATE ─────────────────────────────────────
 *
 * `books.genre` holds what the reader chose; this file holds what we guessed. They are never
 * merged in storage, because a guess that has been written into the same column as a choice
 * can never be improved later without overwriting someone's correction.
 */

/**
 * The whole list, and it is deliberately short.
 *
 * A breakdown with thirty slices is a word cloud, not a chart. Sixteen buckets is enough to
 * be recognisable and few enough to read at a glance, and "Other" absorbs the long tail
 * rather than pretending to place it. `genre.test.ts` holds the count under 16, so growing
 * this list is a decision about the chart rather than a line someone adds in passing.
 */
export const GENRES = [
  'Fantasy',
  'Science fiction',
  'Mystery & crime',
  'Romance',
  'Horror',
  'Historical',
  'Poetry',
  'Children & YA',
  'Fiction',
  'Biography & memoir',
  'History',
  'Science & nature',
  'Society & politics',
  'Business & money',
  'Mind & self',
  'Other',
] as const

export type Genre = (typeof GENRES)[number]

/** What an unrecognised book gets. Never stored as a guess; shown, and correctable. */
export const UNKNOWN_GENRE: Genre = 'Other'

/**
 * Category strings that describe the BOOK OBJECT rather than the book.
 *
 * `nyt:…=2020-10-04` is the dangerous one: it contains "fiction" and a naive substring match
 * files anything that was ever a bestseller under Fiction.
 */
const NOISE_CONTAINS = [
  'accessible book',
  'protected daisy',
  'in library',
  'internet archive',
  'overdrive',
  'large type book',
  'printdisabled',
  'print disabled',
  'bestseller',
  'new york times',
  'book club',
  'reading group guide',
]

/**
 * Dropped only when the WHOLE segment is one of these.
 *
 * `general` has to be exact: it is the last part of "Fiction / Fantasy / General" and means
 * nothing there, but dropping any segment merely CONTAINING it would throw away "general
 * relativity" and "general practice".
 */
const NOISE_EXACT = ['general', 'general books', 'nonfiction', 'non-fiction', 'unknown']

/** Catalogue prefixes whose values are identifiers, not subjects. */
const NOISE_PREFIXES = ['nyt', 'lc', 'ddc', 'dewey', 'oclc', 'isbn', 'place', 'time', 'person']

/** Prefixes whose value IS a subject: `genre:fantasy`, `subject:history`. */
const SUBJECT_PREFIXES = ['genre', 'form', 'subject']

interface Shelf {
  readonly genre: Genre
  /** Matched against whole words, so "art" does not match "heart" or "Bharti". */
  readonly words: readonly string[]
}

/**
 * Tried IN ORDER, so the specific shelves come first and the general ones last.
 *
 * Reordering this list changes what books are filed as, which is why it is one list read top
 * to bottom rather than a set of independent rules.
 */
const SHELVES: readonly Shelf[] = [
  { genre: 'Fantasy', words: ['fantasy', 'magic', 'wizards', 'dragons', 'mythology'] },
  {
    genre: 'Science fiction',
    words: ['science fiction', 'sci-fi', 'scifi', 'dystopian', 'space opera', 'cyberpunk'],
  },
  {
    genre: 'Mystery & crime',
    words: ['mystery', 'crime', 'detective', 'thriller', 'suspense', 'noir', 'murder'],
  },
  { genre: 'Romance', words: ['romance', 'romantic'] },
  { genre: 'Horror', words: ['horror', 'ghost stories', 'supernatural'] },
  {
    genre: 'Historical',
    words: ['historical fiction', 'historical', 'war stories', 'sagas'],
  },
  { genre: 'Poetry', words: ['poetry', 'poems', 'verse', 'sonnets'] },
  {
    genre: 'Children & YA',
    words: [
      'juvenile fiction',
      'juvenile nonfiction',
      'young adult',
      "children's",
      'childrens',
      'picture books',
      'middle grade',
    ],
  },
  {
    genre: 'Biography & memoir',
    words: ['biography', 'autobiography', 'memoir', 'biography & autobiography', 'diaries'],
  },
  { genre: 'History', words: ['history', 'historiography', 'antiquities'] },
  // BEFORE Science & nature, and that order is the whole point: "Social Science" contains
  // the whole word "science", and anthropology is not astronomy. A reader who opens the
  // breakdown and finds their sociology shelved under Science & nature has been told
  // something false about their own library.
  {
    genre: 'Society & politics',
    words: [
      'social science',
      'social sciences',
      'sociology',
      'anthropology',
      'political science',
      'politics',
      'education',
      'law',
      'current affairs',
      'cultural studies',
    ],
  },
  {
    genre: 'Science & nature',
    words: [
      'science',
      'nature',
      'mathematics',
      'medical',
      'technology',
      'engineering',
      'astronomy',
      'biology',
      'physics',
      'chemistry',
    ],
  },
  {
    genre: 'Business & money',
    words: [
      'business',
      'economics',
      'money',
      'finance',
      'management',
      'accounting',
      'marketing',
      'entrepreneurship',
    ],
  },
  {
    genre: 'Mind & self',
    words: [
      'self-help',
      'self help',
      'psychology',
      'philosophy',
      'religion',
      'spirituality',
      'mindfulness',
      'personal growth',
      'ethics',
      'meditation',
    ],
  },
  // LAST of the real shelves: anything still saying only "fiction" or "novel" lands here.
  { genre: 'Fiction', words: ['fiction', 'novel', 'novels', 'literature', 'literary'] },
]

/**
 * `books.categories` is stored as a JSON array of strings, and may be null, empty, or
 * something an older build wrote.
 *
 * Total and forgiving on purpose: a malformed cache must not be able to break the Stats
 * screen. The worst outcome is a book filed under Other.
 */
export function parseCategories(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined || raw === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((v): v is string => typeof v === 'string')
}

/**
 * One raw category into the pieces worth matching, or nothing.
 *
 * "Fiction / Fantasy / General" becomes ["fiction", "fantasy"] — the hierarchy is split and
 * "general" is dropped as noise. "genre:fantasy" becomes ["fantasy"].
 * "nyt:combined-print-and-e-book-fiction=2020-10-04" becomes nothing at all.
 */
export function categoryTerms(category: string): string[] {
  const trimmed = category.trim().toLowerCase()
  if (trimmed === '') return []
  // An `=` means a catalogue assertion with a value, never a subject.
  if (trimmed.includes('=')) return []
  let body = trimmed
  const colon = trimmed.indexOf(':')
  if (colon > 0) {
    const prefix = trimmed.slice(0, colon).trim()
    if (NOISE_PREFIXES.includes(prefix)) return []
    if (SUBJECT_PREFIXES.includes(prefix)) body = trimmed.slice(colon + 1).trim()
  }
  return body
    .split('/')
    .map((part) => part.trim())
    .filter(
      (part) =>
        part !== '' &&
        !NOISE_EXACT.includes(part) &&
        !NOISE_CONTAINS.some((noise) => part.includes(noise)),
    )
}

/** Whole-word containment, so "art" does not match "Bharti" and "war" does not match "warden". */
function hasWord(haystack: string, needle: string): boolean {
  if (haystack === needle) return true
  const at = haystack.indexOf(needle)
  if (at === -1) return false
  const before = at === 0 ? ' ' : haystack[at - 1]
  const after = at + needle.length >= haystack.length ? ' ' : haystack[at + needle.length]
  const boundary = /[^a-z0-9]/
  return boundary.test(before ?? ' ') && boundary.test(after ?? ' ')
}

/**
 * The genre for a book, from its raw categories.
 *
 * Returns `'Other'` rather than guessing when nothing matches. The reader's own answer, if
 * they have given one, is applied by `effectiveGenre` and never written here.
 */
export function genreOf(categories: readonly string[]): Genre {
  const terms = categories.flatMap(categoryTerms)
  if (terms.length === 0) return UNKNOWN_GENRE
  for (const shelf of SHELVES) {
    for (const word of shelf.words) {
      if (terms.some((term) => hasWord(term, word))) return shelf.genre
    }
  }
  return UNKNOWN_GENRE
}

/**
 * What a book is filed as: the reader's answer if they gave one, otherwise our guess.
 *
 * **The reader always wins, and their answer is never overwritten by a better guess.** A
 * correction that a later import can silently undo is not a correction.
 */
export function effectiveGenre(
  chosen: string | null | undefined,
  categories: string | null | undefined,
): Genre {
  if (chosen !== null && chosen !== undefined && isGenre(chosen)) return chosen
  return genreOf(parseCategories(categories))
}

export function isGenre(value: string): value is Genre {
  return (GENRES as readonly string[]).includes(value)
}

export interface GenreTally {
  readonly genre: Genre
  readonly books: number
}

export interface GenreSource {
  /** `books.genre`: the reader's answer, or null. */
  readonly genre: string | null
  /** `books.categories`: the source's raw JSON array, or null. */
  readonly categories: string | null
}

/**
 * How many books fall in each genre, commonest first.
 *
 * **Genres with no books are left out entirely.** A breakdown padded with fifteen zeroes
 * tells the reader nothing and makes the two genres they actually read harder to find.
 *
 * Ties are broken by the order of `GENRES` rather than by whatever order the rows arrived
 * in, so the same library always draws the same chart. A breakdown that reshuffles itself
 * between two identical renders looks like data changing.
 */
export function genreBreakdown(books: readonly GenreSource[]): GenreTally[] {
  const counts = new Map<Genre, number>()
  for (const book of books) {
    const genre = effectiveGenre(book.genre, book.categories)
    counts.set(genre, (counts.get(genre) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([genre, count]) => ({ genre, books: count }))
    .sort((a, b) => b.books - a.books || GENRES.indexOf(a.genre) - GENRES.indexOf(b.genre))
}

/**
 * The share of the whole, 0 to 1, for a bar's width.
 *
 * Guarded against a zero total, which is not a hypothetical: the breakdown renders for a
 * year the reader finished nothing in, and `0/0` is `NaN`, and a `NaN` width silently
 * collapses a bar to nothing rather than throwing.
 */
export function genreShare(tally: GenreTally, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, Math.min(1, tally.books / total))
}
