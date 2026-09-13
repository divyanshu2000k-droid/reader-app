/**
 * A DOUBLE TAP IS ONE TAP.
 *
 * A quick double tap on a Library row opened book detail twice. `Button` guarded its presses
 * and nothing else did.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { acceptPress } from '../pressGuard'
import { rules } from '../theme'

const WINDOW = rules.pressDebounceMs

test('the first press always counts', () => {
  assert.equal(acceptPress(null, 1_000, WINDOW), true)
})

test('a second press inside the window is ignored', () => {
  assert.equal(acceptPress(1_000, 1_000 + WINDOW - 1, WINDOW), false)
  assert.equal(acceptPress(1_000, 1_080, WINDOW), false)
})

test('a press after the window counts again', () => {
  assert.equal(acceptPress(1_000, 1_000 + WINDOW, WINDOW), true)
})

test('the window is long enough to swallow a real double tap and short enough not to lose a retry', () => {
  // Android's double-tap timeout is 300 ms; a deliberate second tap takes well over a second.
  assert.ok(WINDOW >= 300 && WINDOW <= 1000, `pressDebounceMs is ${WINDOW}`)
})
