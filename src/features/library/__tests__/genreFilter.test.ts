/**
 * The Library's genre filter.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { filterByGenre, filterStillApplies, genresPresent } from '../genreFilter'

const row = (id: string, genre: string | null, categories: string[] | null) => ({
  id,
  genre,
  categories: categories === null ? null : JSON.stringify(categories),
})

const LIBRARY = [
  row('a', null, ['Fiction', 'Fantasy']),
  row('b', null, ['Accounting']),
  row('c', 'Poetry', ['Fiction']),
  row('d', null, ['genre:fantasy']),
  row('e', null, ['Dwellings']),
]

test('only the genres actually present are offered', () => {
  // Sixteen chips above a nine-book library, fourteen of them matching nothing, is a filter
  // that makes the screen harder to use.
  assert.deepEqual(genresPresent(LIBRARY), ['Fantasy', 'Poetry', 'Business & money', 'Other'])
})

test('the order is the canonical one, not by count', () => {
  // A control that reorders itself as the library changes means reaching for Fantasy and
  // hitting History. Fantasy leads here despite Poetry and Other tying it.
  const reversed = genresPresent([...LIBRARY].reverse())
  assert.deepEqual(reversed, genresPresent(LIBRARY))
})

test('filtering keeps the rows of one genre, by the same rule the chips used', () => {
  assert.deepEqual(
    filterByGenre(LIBRARY, 'Fantasy').map((r) => r.id),
    ['a', 'd'],
  )
  // 'c' has Fiction categories and a chosen genre of Poetry. The choice wins, here as
  // everywhere, so it must NOT appear under Fiction.
  assert.deepEqual(
    filterByGenre(LIBRARY, 'Poetry').map((r) => r.id),
    ['c'],
  )
  assert.deepEqual(filterByGenre(LIBRARY, 'Fiction'), [])
})

test('no filter is not the same as a filter that matches nothing', () => {
  // One shows the whole tab; the other shows an empty tab honestly.
  assert.equal(filterByGenre(LIBRARY, null).length, LIBRARY.length)
  assert.equal(filterByGenre(LIBRARY, 'Horror').length, 0)
})

test('filtering does not mutate or reorder the rows it was given', () => {
  const before = LIBRARY.map((r) => r.id)
  const all = filterByGenre(LIBRARY, null)
  assert.deepEqual(
    all.map((r) => r.id),
    before,
  )
  assert.notEqual(all, LIBRARY, 'a copy, so a caller cannot sort the source array by accident')
})

test('a filter is dropped once nothing on the tab matches it any more', () => {
  // The tab changes under the filter: a book is finished, removed or moved. A filter left
  // pointing at an empty genre shows an empty list with no visible reason.
  assert.equal(filterStillApplies(LIBRARY, 'Fantasy'), true)
  assert.equal(filterStillApplies(LIBRARY, 'Horror'), false)
  assert.equal(filterStillApplies([], 'Fantasy'), false)
  assert.equal(filterStillApplies([], null), true, 'no filter always applies')
})

test('an empty library offers no chips and crashes on none of this', () => {
  assert.deepEqual(genresPresent([]), [])
  assert.deepEqual(filterByGenre([], 'Fantasy'), [])
})
