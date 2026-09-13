/**
 * A RE-READ STARTS ONLY AFTER THE CURRENT READ HAS ENDED.
 *
 * Offering it on a book still being read created two reads in progress, and the book
 * appeared twice on the Reading tab.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { canStartReread } from '../reads'

test('a finished or abandoned book can be read again', () => {
  assert.equal(canStartReread('finished'), true)
  assert.equal(canStartReread('dnf'), true)
})

test('a book still being read, or never started, cannot', () => {
  assert.equal(canStartReread('reading'), false)
  assert.equal(canStartReread('want'), false)
})
