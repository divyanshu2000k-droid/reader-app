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
  assert.deepEqual(recoveryOffer(41 * MIN), {
    maxMinutes: 41,
    suggestedMinutes: 41,
    stoppedEarly: false,
  })
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
  assert.deepEqual(recoveryOffer(10), {
    maxMinutes: 1,
    suggestedMinutes: 1,
    stoppedEarly: false,
  })
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

/**
 * THE PHONE STOPPED THE TIMER AND THE READER KEPT READING.
 *
 * Measured on a Nothing Phone 2a on 2026-09-19, with "restrict background usage" set — which
 * is what a Xiaomi does by default to an app it does not recognise. Android demoted the
 * foreground service immediately and killed it about 47 seconds into a five-minute session.
 *
 * Before this fix, that reader was offered a maximum of ONE minute for five minutes of
 * reading, could not type 5, and was told "It started 1 minute ago" — which was simply false.
 * The cap rested on "nobody can have read longer than the elapsed time", which stopped being
 * true the moment the bound became the heartbeat instead of the wall clock.
 *
 * The app is the authority on how long it was running. The reader is the authority on how
 * long they read.
 */
test('the reader may record more than the app was alive for', () => {
  const offer = recoveryOffer(47, 5 * 60)
  assert.equal(offer.maxMinutes, 5, 'the session existed for five minutes')
  assert.equal(offer.suggestedMinutes, 1, 'the app only knows it ran for about one')
  assert.equal(offer.stoppedEarly, true)

  assert.deepEqual(checkMinutes('5', offer.maxMinutes), { ok: true, minutes: 5 })
  assert.deepEqual(checkMinutes('1', offer.maxMinutes), { ok: true, minutes: 1 })
})

test('but never more than the session has existed', () => {
  // The wall clock is a real physical limit, and this is the half that must not loosen.
  const offer = recoveryOffer(47, 5 * 60)
  assert.deepEqual(checkMinutes('6', offer.maxMinutes), { ok: false, reason: 'tooLong' })
  assert.deepEqual(checkMinutes('600', offer.maxMinutes), { ok: false, reason: 'tooLong' })
})

test('a healthy session suggests its whole length and is not flagged', () => {
  // Nothing stopped the timer: the heartbeat and the wall clock agree, so the sheet keeps
  // its original copy rather than blaming the phone for something it did not do.
  const offer = recoveryOffer(20 * 60, 20 * 60 + 5)
  assert.equal(offer.maxMinutes, 20)
  assert.equal(offer.suggestedMinutes, 20)
  assert.equal(offer.stoppedEarly, false)
})

test('overnight still refuses to suggest anything, and still caps at the wall clock', () => {
  const nineHours = 9 * 60 * 60
  const offer = recoveryOffer(nineHours, nineHours)
  assert.equal(offer.suggestedMinutes, null, 'nine hours is never offered as a guess')
  assert.equal(offer.maxMinutes, 540)
})

test('a heartbeat later than the wall clock cannot raise the suggestion above it', () => {
  // A clock that moved backwards. The suggestion is clamped to the wall clock, so it can
  // never exceed the maximum the reader is allowed to enter.
  const offer = recoveryOffer(9999, 120)
  assert.equal(offer.maxMinutes, 2)
  assert.equal(offer.suggestedMinutes, 2)
  assert.equal(offer.stoppedEarly, false)
})

test('called with one argument, it behaves exactly as it did before', () => {
  // Every caller passes both now, but the default keeps the old contract provable.
  assert.deepEqual(recoveryOffer(41 * 60), recoveryOffer(41 * 60, 41 * 60))
})
