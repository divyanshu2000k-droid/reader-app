import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isbn10To13, isValidIsbn10, isValidIsbn13, toIsbn13 } from '../isbn'

// Real ISBNs of Piranesi (Bloomsbury), from the Open Library response in the fixtures.
test('a real ISBN-13 and its ISBN-10 agree', () => {
  assert.equal(isValidIsbn13('9781635575637'), true)
  assert.equal(isValidIsbn10('163557563X'), true)
  assert.equal(isbn10To13('163557563X'), '9781635575637')
})

test('hyphens, spaces and a lowercase x are the same ISBN', () => {
  assert.equal(toIsbn13('978-1-63557-563-7'), '9781635575637')
  assert.equal(toIsbn13('1 63557 563 x'), '9781635575637')
})

test('a wrong check digit is not an ISBN, so it can never merge two books', () => {
  assert.equal(isValidIsbn13('9781635575638'), false)
  assert.equal(isValidIsbn10('1635575631'), false)
  assert.equal(toIsbn13('9781635575638'), null)
})

test('anything that is not an ISBN is null, never a guess', () => {
  assert.equal(toIsbn13(''), null)
  assert.equal(toIsbn13(null), null)
  assert.equal(toIsbn13('ABC'), null)
  assert.equal(toIsbn13('97816355756'), null)
})
