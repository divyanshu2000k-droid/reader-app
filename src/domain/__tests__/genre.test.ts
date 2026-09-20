/**
 * Genre mapping, against the categories REAL sources actually returned.
 *
 * Every category string asserted here was captured from Google Books or Open Library, or
 * read out of the sandbox library on 2026-09-19 — including the ugly ones. Inventing tidy
 * category strings and testing against those would assert that the function works on data we
 * will never receive, which is the substitute test CLAUDE.md's first hazard is about.
 *
 * Two of these tests were written passing and then failed, which is why they are here: the
 * noise list only matched whole strings, so "New York Times bestseller" survived; and
 * "Social Science" was filed under Science & nature.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  genreBreakdown,
  genreShare,
  GENRES,
  UNKNOWN_GENRE,
  categoryTerms,
  effectiveGenre,
  genreOf,
  isGenre,
  parseCategories,
} from '../genre'

test('the list is short enough to be a chart, and Other is in it', () => {
  // A breakdown with thirty slices is a word cloud. If this number grows a lot, the chart
  // is the thing to reconsider, not this assertion.
  assert.ok(GENRES.length <= 16, `${GENRES.length} genres is too many for a breakdown`)
  assert.ok(GENRES.includes(UNKNOWN_GENRE))
  assert.equal(new Set(GENRES).size, GENRES.length, 'duplicate genre')
})

// ─── the dangerous one ───────────────────────────────────────────────────────

test('a bestseller tag does not make a book Fiction', () => {
  // "nyt:combined-print-and-e-book-fiction=2020-10-04" contains the word "fiction". A naive
  // substring match files every book that was ever a bestseller under Fiction, including
  // cookbooks. This is the single most likely wrong answer in the whole file.
  assert.deepEqual(categoryTerms('nyt:combined-print-and-e-book-fiction=2020-10-04'), [])
  assert.equal(
    genreOf(['nyt:combined-print-and-e-book-fiction=2020-10-04', 'Accounting']),
    'Business & money',
  )
})

test('an = makes it an assertion about the book, whatever the prefix', () => {
  /**
   * The `=` rule needs its OWN case, and the one above is not it.
   *
   * "nyt:…=2020-10-04" is discarded by the noise-PREFIX list before the `=` rule is
   * reached, so deleting the `=` rule left that assertion passing — the mutation sweep
   * caught it going green on 2026-09-20. These two survive the prefix list and are caught
   * only by the `=`.
   */
  assert.deepEqual(categoryTerms('subject:history=1999'), [])
  assert.deepEqual(categoryTerms('rating=fantasy'), [])
  assert.equal(genreOf(['subject:history=1999']), 'Other')
  assert.equal(genreOf(['rating=fantasy']), 'Other')
  // ...and the same prefix WITHOUT a value is still a subject.
  assert.deepEqual(categoryTerms('subject:history'), ['history'])
})

test('shelf furniture is dropped rather than guessed at', () => {
  for (const noise of [
    'Accessible book',
    'New York Times bestseller',
    'In library',
    'Protected DAISY',
    'Large type books',
  ]) {
    assert.deepEqual(categoryTerms(noise), [], noise)
  }
  assert.equal(genreOf(['Accessible book', 'New York Times bestseller']), 'Other')
})

// ─── real captures ───────────────────────────────────────────────────────────

test('Open Library prefixes: the value is the subject', () => {
  assert.deepEqual(categoryTerms('genre:fantasy'), ['fantasy'])
  assert.deepEqual(categoryTerms('form:novel'), ['novel'])
  assert.equal(genreOf(['form:novel', 'genre:fantasy']), 'Fantasy')
})

test("Google Books hierarchies: the specific part wins, 'General' is dropped", () => {
  assert.deepEqual(categoryTerms('Fiction / Fantasy / General'), ['fiction', 'fantasy'])
  assert.equal(genreOf(['Fiction / Fantasy / General']), 'Fantasy')
  assert.equal(genreOf(['Biography & Autobiography / Literary Figures']), 'Biography & memoir')
})

test('the real sandbox library files as expected', () => {
  const cases: [string[], string][] = [
    [['Fiction'], 'Fiction'],
    [['Hindi fiction'], 'Fiction'],
    [['Indic literature'], 'Fiction'],
    [['English literature'], 'Fiction'],
    [['Social Science'], 'Society & politics'],
    [['Performing Arts'], 'Other'],
    [['Psychology', 'Self-help techniques'], 'Mind & self'],
    [['Ethics'], 'Mind & self'],
    [['Money', 'Consumption (Economics)', 'Accounting'], 'Business & money'],
    // A place name and two random subject headings. There is no honest answer here.
    [['Indonesia'], 'Other'],
    [['Dwellings', 'Labyrinths', 'Curiosities and wonders'], 'Other'],
  ]
  for (const [categories, expected] of cases) {
    assert.equal(genreOf(categories), expected, JSON.stringify(categories))
  }
})

// ─── precedence ──────────────────────────────────────────────────────────────

test('specific beats general, whatever order the source lists them in', () => {
  assert.equal(genreOf(['Fiction', 'Fantasy']), 'Fantasy')
  assert.equal(genreOf(['Fantasy', 'Fiction']), 'Fantasy')
  assert.equal(genreOf(['Fiction', 'Mystery']), 'Mystery & crime')
  assert.equal(genreOf(['Juvenile Fiction', 'Fantasy']), 'Fantasy')
})

test('a book that only says Fiction is Fiction, not Other', () => {
  assert.equal(genreOf(['Fiction']), 'Fiction')
  assert.equal(genreOf(['Novels']), 'Fiction')
})

test('social science is not natural science', () => {
  // "Social Science" contains the whole word "science". Filing anthropology under Science &
  // nature tells the reader something false about their own library, and it is the kind of
  // wrong that looks right in a chart.
  assert.equal(genreOf(['Social Science']), 'Society & politics')
  assert.equal(genreOf(['Political Science']), 'Society & politics')
  assert.equal(genreOf(['Science']), 'Science & nature')
  assert.equal(genreOf(['Science / Astronomy']), 'Science & nature')
})

test('whole words only, so a substring is not a shelf', () => {
  /**
   * These cases are chosen so they FAIL when the word-boundary check is removed.
   *
   * The first version of this test used "The Warden" and "Bharti Mukherjee", which return
   * 'Other' whether or not the boundary check exists — neither "war" nor "art" is a shelf
   * word, so nothing was ever going to match. It passed against the mutation, which is
   * silent-pass item 19 exactly: a test that would have passed either way.
   *
   * "law" and "money" ARE shelf words, and they sit inside these perfectly ordinary
   * subject headings.
   */
  assert.equal(genreOf(['Lawrence Durrell']), 'Other', '"law" inside "Lawrence"')
  assert.equal(genreOf(['Moneyball']), 'Other', '"money" inside "Moneyball"')
  assert.equal(genreOf(['Historiography']), 'History', 'a real prefix match still counts')
  // ...and the real words still match.
  assert.equal(genreOf(['War stories']), 'Historical')
  assert.equal(genreOf(['Law']), 'Society & politics')
  assert.equal(genreOf(['Money']), 'Business & money')
})

// ─── the reader's own answer ─────────────────────────────────────────────────

test("the reader's choice beats every guess", () => {
  assert.equal(effectiveGenre('Poetry', JSON.stringify(['Fiction', 'Fantasy'])), 'Poetry')
  assert.equal(effectiveGenre('Other', JSON.stringify(['Fantasy'])), 'Other')
})

test('a choice we no longer recognise falls back to the guess, not to nothing', () => {
  // An older build, or a synced row from a future one. Refusing to render is worse than
  // showing our own guess.
  assert.equal(effectiveGenre('Steampunk', JSON.stringify(['Fantasy'])), 'Fantasy')
  assert.equal(effectiveGenre('', JSON.stringify(['Fantasy'])), 'Fantasy')
  assert.equal(effectiveGenre(null, JSON.stringify(['Fantasy'])), 'Fantasy')
})

// ─── a malformed cache must not break the screen ─────────────────────────────

test('categories that are not what we expect produce Other, never a throw', () => {
  assert.deepEqual(parseCategories(null), [])
  assert.deepEqual(parseCategories(undefined), [])
  assert.deepEqual(parseCategories(''), [])
  assert.deepEqual(parseCategories('not json'), [])
  assert.deepEqual(parseCategories('{"a":1}'), [])
  assert.deepEqual(parseCategories('[1, 2, null]'), [])
  assert.deepEqual(parseCategories('["Fiction", 7]'), ['Fiction'])
  assert.equal(effectiveGenre(null, 'not json'), 'Other')
  assert.equal(genreOf([]), 'Other')
  assert.equal(genreOf(['', '   ']), 'Other')
})

test('isGenre is the guard the database needs', () => {
  assert.equal(isGenre('Fantasy'), true)
  assert.equal(isGenre('fantasy'), false, 'case matters: these are stored values')
  assert.equal(isGenre('Steampunk'), false)
})

// ─── the breakdown ───────────────────────────────────────────────────────────

const book = (genre: string | null, categories: string[] | null) => ({
  genre,
  categories: categories === null ? null : JSON.stringify(categories),
})

test('the breakdown counts books per genre, commonest first', () => {
  const tally = genreBreakdown([
    book(null, ['Fiction', 'Fantasy']),
    book(null, ['genre:fantasy']),
    book(null, ['Fiction']),
    book(null, ['Accounting']),
  ])
  assert.deepEqual(tally, [
    { genre: 'Fantasy', books: 2 },
    { genre: 'Fiction', books: 1 },
    { genre: 'Business & money', books: 1 },
  ])
})

test('genres with no books are left out, not shown as zero', () => {
  const tally = genreBreakdown([book(null, ['Poetry'])])
  assert.deepEqual(tally, [{ genre: 'Poetry', books: 1 }])
  assert.equal(tally.length, 1, 'a breakdown padded with zeroes hides the real answer')
})

test('ties break by the genre order, so the same library draws the same chart', () => {
  const one = genreBreakdown([book(null, ['Poetry']), book(null, ['Fantasy'])])
  const other = genreBreakdown([book(null, ['Fantasy']), book(null, ['Poetry'])])
  assert.deepEqual(one, other)
  // Fantasy is earlier in GENRES than Poetry, so it leads on a tie whichever order they came.
  assert.equal(one[0]?.genre, 'Fantasy')
})

test("the reader's corrections are what the breakdown counts", () => {
  const tally = genreBreakdown([
    book('Poetry', ['Fiction', 'Fantasy']),
    book(null, ['Fiction', 'Fantasy']),
  ])
  assert.deepEqual(tally, [
    { genre: 'Fantasy', books: 1 },
    { genre: 'Poetry', books: 1 },
  ])
})

test('an empty year has an empty breakdown, not a crash', () => {
  assert.deepEqual(genreBreakdown([]), [])
  assert.equal(genreShare({ genre: 'Fiction', books: 0 }, 0), 0, '0/0 must not be NaN')
})

test('a share is a fraction of the whole, and never escapes 0..1', () => {
  assert.equal(genreShare({ genre: 'Fiction', books: 3 }, 12), 0.25)
  assert.equal(genreShare({ genre: 'Fiction', books: 12 }, 12), 1)
  // A total smaller than the count is not representable from real data, but a NaN or a 4x
  // width would be a silent layout break rather than an error.
  assert.equal(genreShare({ genre: 'Fiction', books: 8 }, 2), 1)
  assert.equal(genreShare({ genre: 'Fiction', books: 1 }, Number.NaN), 0)
})
