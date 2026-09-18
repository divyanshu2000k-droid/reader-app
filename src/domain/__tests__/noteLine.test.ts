/**
 * HOW A BOOK'S NOTES ARE DESCRIBED, IN THE ONE PLACE BOTH SCREENS READ IT FROM.
 *
 * The notes list's header and book detail's actions sheet both say this line. It lives in
 * `domain/` so they cannot drift; these assertions are what "cannot drift" means.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { countsLine } from '../noteLine'

test('the line leaves out whichever is zero', () => {
  assert.equal(countsLine({ quotes: 3, notes: 6, total: 9 }), '6 notes · 3 quotes')
  assert.equal(countsLine({ quotes: 0, notes: 6, total: 6 }), '6 notes')
  assert.equal(countsLine({ quotes: 3, notes: 0, total: 3 }), '3 quotes')
})

test('one of a thing is singular', () => {
  assert.equal(countsLine({ quotes: 1, notes: 1, total: 2 }), '1 note · 1 quote')
})

test('a book with neither says nothing, so no caller can render "0 notes · 0 quotes"', () => {
  assert.equal(countsLine({ quotes: 0, notes: 0, total: 0 }), '')
})
