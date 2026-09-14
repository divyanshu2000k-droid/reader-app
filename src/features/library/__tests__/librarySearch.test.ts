import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { highlight, matchLibrary, statusBadge, type IndexedBook } from '../librarySearch'

const index: IndexedBook[] = [
  { bookId: 'overstory', title: 'The Overstory', author: 'Richard Powers', status: 'reading' },
  { bookId: 'bewilder', title: 'Bewilderment', author: 'Richard Powers', status: 'finished' },
  { bookId: 'echo', title: 'The Echo Maker', author: 'Richard Powers', status: 'want' },
  {
    bookId: 'late',
    title: 'Late Garden in Translation',
    author: 'Haruki Tóibín',
    status: 'reading',
  },
  { bookId: 'powerbook', title: 'Power of Habit', author: null, status: 'dnf' },
]

describe('matching the library', () => {
  test('every word must match, in the title or the author', () => {
    assert.deepEqual(matchLibrary(index, 'overstory powers', null, 50), ['overstory'])
    assert.deepEqual(matchLibrary(index, 'overstory dickens', null, 50), [])
  })

  test('a prefix matches, and a title match ranks above an author match', () => {
    assert.deepEqual(matchLibrary(index, 'power', null, 50), [
      'powerbook',
      'overstory',
      'bewilder',
      'echo',
    ])
  })

  test('accents and case do not decide: toibin finds Tóibín', () => {
    assert.deepEqual(matchLibrary(index, 'TOIBIN', null, 50), ['late'])
  })

  test('the scope chip filters by status', () => {
    assert.deepEqual(matchLibrary(index, 'powers', 'finished', 50), ['bewilder'])
    assert.deepEqual(matchLibrary(index, 'powers', 'dnf', 50), [])
  })

  test('nothing typed is nothing found, and the limit holds', () => {
    assert.deepEqual(matchLibrary(index, '   ', null, 50), [])
    assert.equal(matchLibrary(index, 'richard', null, 2).length, 2)
  })
})

describe('what a match shows', () => {
  test('the matched word is highlighted, whatever its accents or case', () => {
    assert.deepEqual(highlight('Richard Powers', 'powers'), [
      { text: 'Richard ', match: false },
      { text: 'Powers', match: true },
    ])
    assert.deepEqual(highlight('Haruki Tóibín', 'toib'), [
      { text: 'Haruki ', match: false },
      { text: 'Tóibín', match: true },
    ])
    assert.deepEqual(highlight('Richard Powers', ''), [
      { text: 'Richard Powers', match: false },
    ])
  })

  test('the badge says where the book is', () => {
    const y2024 = new Date(2024, 5, 1).getTime()
    assert.equal(statusBadge('reading', '42%', null, null), 'READING · 42%')
    assert.equal(statusBadge('reading', null, null, null), 'READING')
    assert.equal(statusBadge('finished', null, y2024, null), 'FINISHED · 2024')
    assert.equal(statusBadge('finished', null, null, y2024), 'FINISHED · 2024')
    assert.equal(statusBadge('finished', null, null, null), 'FINISHED')
    assert.equal(statusBadge('want', null, null, null), 'WANT TO READ')
    assert.equal(statusBadge('dnf', null, null, null), 'DNF')
  })
})
