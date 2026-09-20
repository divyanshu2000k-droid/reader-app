/**
 * The yearly goal's rules.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { GOAL_MAX, checkGoal, goalLabel, goalProgress } from '../goal'

test('an empty field clears the goal, and is not an error', () => {
  // "Pages and hours are always tracked whether or not a goal exists. Never gate statistics
  // behind setting a target" (03-DATA-MODEL). Refusing an empty field would turn an optional
  // feature into a chore.
  assert.deepEqual(checkGoal(''), { ok: true, target: null })
  assert.deepEqual(checkGoal('   '), { ok: true, target: null })
})

test('a target is whole books', () => {
  assert.deepEqual(checkGoal('12'), { ok: true, target: 12 })
  assert.equal(checkGoal('12.5').ok, false)
  assert.equal(
    checkGoal('1e3').ok,
    false,
    'the same shape that put a fraction in an INTEGER column',
  )
  assert.equal(checkGoal('-4').ok, false)
  assert.equal(checkGoal('twelve').ok, false)
})

test('zero is refused rather than quietly meaning none', () => {
  // The way to mean none is an empty field, which the label says. Accepting 0 and storing it
  // would leave a live goal row nothing knows how to show.
  const checked = checkGoal('0')
  assert.equal(checked.ok, false)
  assert.match(checked.ok ? '' : checked.reason, /leave it empty/)
})

test('an absurd target is a typo, and says so', () => {
  assert.deepEqual(checkGoal(String(GOAL_MAX)), { ok: true, target: GOAL_MAX })
  assert.equal(checkGoal(String(GOAL_MAX + 1)).ok, false)
})

// ─── progress ────────────────────────────────────────────────────────────────

test('progress is a fraction, the count, and whether it is met', () => {
  const p = goalProgress(12, 3)
  assert.equal(p?.fraction, 0.25)
  assert.equal(p?.remaining, 9)
  assert.equal(p?.met, false)
  assert.equal(goalLabel(p!), '3 of 12 books')
})

test('beating the goal fills the bar and still shows the real number', () => {
  // A bar drawn two and a half times across the screen is a layout bug; hiding the 30 is a
  // lie. Clamped width, honest count.
  const p = goalProgress(12, 30)
  assert.equal(p?.fraction, 1)
  assert.equal(p?.finished, 30)
  assert.equal(p?.remaining, 0)
  assert.equal(p?.met, true)
  assert.equal(goalLabel(p!), '30 of 12 books · done')
})

test('exactly meeting it counts as met', () => {
  const p = goalProgress(12, 12)
  assert.equal(p?.met, true)
  assert.equal(p?.fraction, 1)
})

test('one book reads as a book, not books', () => {
  assert.equal(goalLabel(goalProgress(1, 0)!), '0 of 1 book')
})

test('a nonsensical target has no progress rather than a broken bar', () => {
  assert.equal(goalProgress(0, 3), null)
  assert.equal(goalProgress(-1, 3), null)
  assert.equal(goalProgress(Number.NaN, 3), null)
  // ...and a nonsensical count is treated as none, never as a negative width.
  assert.equal(goalProgress(12, -5)?.fraction, 0)
  assert.equal(goalProgress(12, Number.NaN)?.finished, 0)
})
