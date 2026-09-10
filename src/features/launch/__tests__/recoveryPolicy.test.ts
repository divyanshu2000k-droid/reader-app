/**
 * A RECOVERED SESSION MUST NEVER INVENT A DURATION.
 *
 * The first recovery sheet saved `now - startedAt` without asking, so a session killed at
 * 23:00 and reopened at 08:00 recorded nine hours of reading. These assertions pin the
 * replacement rule: elapsed time is an upper bound, it is only offered within a cap, and
 * nothing past the cap is guessed.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { RECOVERY_PREFILL_CAP_MINUTES, checkMinutes, recoveryOffer } from '../recoveryPolicy'

const MIN = 60
const HOUR = 60 * MIN

test('the overnight case: nine hours elapsed offers no duration at all', () => {
  const offer = recoveryOffer(9 * HOUR)
  assert.equal(offer.suggestedMinutes, null, 'nine hours was offered as reading time')
  // The upper bound is still known, and still enforced.
  assert.equal(offer.maxMinutes, 540)
})

test('a plausible sitting is offered, as a starting value only', () => {
  assert.deepEqual(recoveryOffer(41 * MIN), { maxMinutes: 41, suggestedMinutes: 41 })
})

test('the cap is inclusive at exactly three hours and closed one minute later', () => {
  assert.equal(recoveryOffer(RECOVERY_PREFILL_CAP_MINUTES * MIN).suggestedMinutes, 180)
  assert.equal(recoveryOffer((RECOVERY_PREFILL_CAP_MINUTES + 1) * MIN).suggestedMinutes, null)
})

test('partial minutes round down: we never offer time that did not pass', () => {
  assert.equal(recoveryOffer(41 * MIN + 59).maxMinutes, 41)
})

test('a clock that went backwards, or a broken timestamp, never becomes a duration', () => {
  for (const bad of [-5 * MIN, Number.NaN, Number.NEGATIVE_INFINITY]) {
    const offer = recoveryOffer(bad)
    assert.equal(offer.maxMinutes, 1, `${bad} produced ${offer.maxMinutes} minutes`)
  }
  assert.equal(recoveryOffer(Number.POSITIVE_INFINITY).maxMinutes, 1)
})

test('a session killed seconds after starting can still be kept as one minute', () => {
  assert.deepEqual(recoveryOffer(10), { maxMinutes: 1, suggestedMinutes: 1 })
})

test('what the reader types is checked: whole minutes, at least one, never beyond elapsed', () => {
  assert.deepEqual(checkMinutes('25', 41), { ok: true, minutes: 25 })
  assert.deepEqual(checkMinutes('  41 ', 41), { ok: true, minutes: 41 })
  assert.deepEqual(checkMinutes('', 41), { ok: false, reason: 'empty' })
  assert.deepEqual(checkMinutes('   ', 41), { ok: false, reason: 'empty' })
  assert.deepEqual(checkMinutes('1.5', 41), { ok: false, reason: 'notWhole' })
  assert.deepEqual(checkMinutes('-5', 41), { ok: false, reason: 'notWhole' })
  assert.deepEqual(checkMinutes('abc', 41), { ok: false, reason: 'notWhole' })
  assert.deepEqual(checkMinutes('0', 41), { ok: false, reason: 'tooShort' })
  // The upper bound holds even for a reader who types a big number on purpose.
  assert.deepEqual(checkMinutes('42', 41), { ok: false, reason: 'tooLong' })
  assert.deepEqual(checkMinutes('600', 540), { ok: false, reason: 'tooLong' })
})
