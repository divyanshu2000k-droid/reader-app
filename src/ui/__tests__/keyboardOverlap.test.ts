import assert from 'node:assert/strict'
import { test } from 'node:test'

import { keyboardOverlap } from '../keyboardOverlap'

test('no keyboard, no overlap', () => {
  assert.equal(keyboardOverlap(2400, null), 0)
})

test('a window Android did not resize is covered by the keyboard height', () => {
  // A 2400px window, keyboard top at 1500: 900 px of the form are under the keyboard.
  assert.equal(keyboardOverlap(2400, 1500), 900)
})

test('a window Android already resized ends above the keyboard: nothing to add', () => {
  assert.equal(keyboardOverlap(1500, 1500), 0)
  assert.equal(keyboardOverlap(1480, 1500), 0)
})

test('fractional layout values round to whole pixels', () => {
  assert.equal(keyboardOverlap(2400.6, 1500.2), 900)
})
