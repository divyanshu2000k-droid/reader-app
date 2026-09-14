import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pillBelowText } from '../rowLayout'

test('the design width at normal text keeps the pill beside the title', () => {
  assert.equal(pillBelowText(360, 1, 360), false)
  assert.equal(pillBelowText(412, 1, 360), false)
})

test('the phone as tested, 320 dp at 1.3x, moves it below', () => {
  assert.equal(pillBelowText(320, 1.3, 360), true)
})

test('large text on a wide phone is the same case as a narrow phone', () => {
  assert.equal(pillBelowText(412, 1.3, 360), true)
  assert.equal(pillBelowText(340, 1, 360), true)
})

test('a missing font scale counts as 1, never a division by zero', () => {
  assert.equal(pillBelowText(412, 0, 360), false)
})
