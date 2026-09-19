/**
 * THE HEARTBEAT, AND THE BOUND IT PUTS ON A RECOVERED SESSION.
 *
 * `recoveryPolicy.ts` has promised since Slice 1 that the timer would tighten this bound.
 * The assertion that matters is the overnight one: a session killed at 23:00 and reopened at
 * 08:00 must be bounded by the last heartbeat, not by nine hours of the app being shut.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recoveryOffer } from '@/features/launch/recoveryPolicy'
import {
  HEARTBEAT_MS,
  decodeRun,
  encodeRun,
  heartbeatDue,
  recoveryBoundAt,
  type TimerRun,
} from '../timerRun'
import { elapsedSeconds } from '../timerState'

const T0 = 1_700_000_000_000
const MINUTE = 60_000

const run = (over: Partial<TimerRun> = {}): TimerRun => ({
  sessionId: 's1',
  readId: 'r1',
  bookId: 'b1',
  segments: [{ startedAt: T0, endedAt: null }],
  lastBeatAt: null,
  ...over,
})

// ─── THE OVERNIGHT CASE, WHICH IS THE WHOLE POINT ────────────────────────────

test('a session killed at 23:00 and reopened at 08:00 is bounded by the HEARTBEAT', () => {
  const killedAt = T0 + 22 * MINUTE // the app died 22 minutes in
  const reopenedAt = T0 + 9 * 60 * MINUTE // nine hours later
  const r = run({ lastBeatAt: killedAt })

  const boundAt = recoveryBoundAt(r, reopenedAt)
  const seconds = elapsedSeconds(
    { sessionId: r.sessionId, readId: r.readId, bookId: r.bookId, segments: r.segments },
    boundAt,
  )
  assert.equal(seconds, 22 * 60)

  // And that bound is inside the prefill cap, so the reader is OFFERED 22 minutes rather
  // than being handed an empty field — which is what nine hours would have produced.
  const offer = recoveryOffer(seconds)
  assert.equal(offer.maxMinutes, 22)
  assert.equal(offer.suggestedMinutes, 22)
})

test('WITHOUT a heartbeat the bound is still now, and the nine hours is refused a prefill', () => {
  const reopenedAt = T0 + 9 * 60 * MINUTE
  const seconds = elapsedSeconds(
    { sessionId: 's1', readId: 'r1', bookId: 'b1', segments: run().segments },
    recoveryBoundAt(run(), reopenedAt),
  )
  assert.equal(seconds, 9 * 3600)
  // 540 minutes is past the 180-minute cap: the field starts empty and the reader is asked.
  assert.equal(recoveryOffer(seconds).suggestedMinutes, null)
})

test('no run at all falls back to now, rather than throwing', () => {
  assert.equal(recoveryBoundAt(null, T0 + 1000), T0 + 1000)
})

test('a heartbeat from the FUTURE is not trusted past now', () => {
  // A backwards clock. Trusting it would claim a longer session than could have happened.
  assert.equal(recoveryBoundAt(run({ lastBeatAt: T0 + 9_000_000 }), T0 + 1000), T0 + 1000)
})

test('paused time is still excluded from a recovered session', () => {
  const r = run({
    segments: [
      { startedAt: T0, endedAt: T0 + 5 * MINUTE },
      { startedAt: T0 + 60 * MINUTE, endedAt: null },
    ],
    lastBeatAt: T0 + 63 * MINUTE,
  })
  const seconds = elapsedSeconds(
    { sessionId: r.sessionId, readId: r.readId, bookId: r.bookId, segments: r.segments },
    recoveryBoundAt(r, T0 + 600 * MINUTE),
  )
  assert.equal(seconds, (5 + 3) * 60)
})

// ─── WHEN TO BEAT ────────────────────────────────────────────────────────────

test('the first beat is due immediately', () => {
  assert.equal(heartbeatDue(run(), T0), true)
})

/**
 * A NaN heartbeat, which is what a corrupted payload decodes to if anything ever lets one
 * through. `now - NaN >= HEARTBEAT_MS` is false, so without the explicit guard the timer
 * would decide a beat is never due again and stop heartbeating for the rest of the session.
 *
 * The `lastBeatAt: null` case alone does NOT prove the guard exists: `now - null` is
 * `now - 0`, an enormous number, so the fallback returns true regardless. The mutation
 * sweep caught that on 2026-09-18.
 */
test('a NaN heartbeat is due NOW, not never', () => {
  assert.equal(heartbeatDue(run({ lastBeatAt: Number.NaN }), T0), true)
})

test('a beat is due once the interval has passed, and not before', () => {
  const r = run({ lastBeatAt: T0 })
  assert.equal(heartbeatDue(r, T0 + HEARTBEAT_MS - 1), false)
  assert.equal(heartbeatDue(r, T0 + HEARTBEAT_MS), true)
})

test('a beat timestamped in the future is due NOW, not never', () => {
  // The naive `now - lastBeatAt >= HEARTBEAT_MS` would wait forever after a clock change.
  assert.equal(heartbeatDue(run({ lastBeatAt: T0 + 9_000_000 }), T0), true)
})

// ─── STORAGE ─────────────────────────────────────────────────────────────────

test('a run survives the round trip through storage', () => {
  const r = run({ lastBeatAt: T0 + 1000, segments: [{ startedAt: T0, endedAt: T0 + 500 }] })
  assert.deepEqual(decodeRun(encodeRun(r)), r)
})

test('a payload that is not a run reads as no run, and never throws', () => {
  for (const bad of ['', '{', 'null', '[]', '17', '"text"', '{"sessionId":"s1"}']) {
    assert.equal(decodeRun(bad), null, bad)
  }
})

test('a run whose ids are not strings is discarded', () => {
  // Isolated from the other fields: with segments and lastBeatAt valid, only the id check
  // can reject these. Without that isolation the mutation that deletes it survives.
  assert.equal(
    decodeRun('{"sessionId":17,"readId":"r","bookId":"b","segments":[],"lastBeatAt":null}'),
    null,
  )
  assert.equal(
    decodeRun('{"sessionId":"s","readId":null,"bookId":"b","segments":[],"lastBeatAt":null}'),
    null,
  )
  assert.equal(
    decodeRun('{"sessionId":"s","readId":"r","bookId":9,"segments":[],"lastBeatAt":null}'),
    null,
  )
  // And the same payload with all three as strings IS accepted, so the test is not passing
  // for some unrelated reason.
  assert.deepEqual(
    decodeRun('{"sessionId":"s","readId":"r","bookId":"b","segments":[],"lastBeatAt":null}'),
    { sessionId: 's', readId: 'r', bookId: 'b', segments: [], lastBeatAt: null },
  )
})

test('a run with malformed segments is discarded rather than half-read', () => {
  assert.equal(
    decodeRun(
      '{"sessionId":"s","readId":"r","bookId":"b","segments":[{"startedAt":"x"}],"lastBeatAt":null}',
    ),
    null,
  )
  assert.equal(
    decodeRun(
      '{"sessionId":"s","readId":"r","bookId":"b","segments":"nope","lastBeatAt":null}',
    ),
    null,
  )
})

test('a corrupt run cannot stop recovery: the bound falls back to now', () => {
  const decoded = decodeRun('{ this is not json')
  assert.equal(decoded, null)
  assert.equal(recoveryBoundAt(decoded, T0 + 50), T0 + 50)
})

// ─── THE BOUND MUST REACH THE READER, NOT JUST EXIST ─────────────────────────

/**
 * The heartbeat was written by the timer for a whole day and read by nobody: the recovery
 * sheet still computed `now - occurredAt` and threw the tighter bound away. Nothing failed,
 * nothing logged, and the reader was still offered nine hours.
 *
 * This asserts the JOIN between the two halves, in the direction the guarantee runs: given a
 * run with a heartbeat, the number the sheet is handed must be the heartbeat's, not the
 * wall clock's.
 */
test('the number the recovery sheet is handed comes from the heartbeat, not from now', () => {
  const r = run({ lastBeatAt: T0 + 22 * MINUTE })
  const reopenedAt = T0 + 9 * 60 * MINUTE

  const handed = elapsedSeconds(
    { sessionId: r.sessionId, readId: r.readId, bookId: r.bookId, segments: r.segments },
    recoveryBoundAt(r, reopenedAt),
  )
  const wallClock = (reopenedAt - T0) / 1000

  assert.equal(handed, 22 * 60)
  assert.notEqual(handed, wallClock)
  // And the difference is the whole point: one is offerable, the other is not.
  assert.equal(recoveryOffer(handed).suggestedMinutes, 22)
  assert.equal(recoveryOffer(wallClock).suggestedMinutes, null)
})

/**
 * THE SECOND HEARTBEAT, added 2026-09-19.
 *
 * There are two, and the one in this file's `TimerRun` is the one that does not work when it
 * matters. React Native's timers are driven by frame callbacks; a backgrounded app draws no
 * frames. Measured on a phone: 2 beats in 75 seconds with the app in front, **0** in the next
 * 75 with it backgrounded, **0** in six minutes of doze. Since a heartbeat exists solely to
 * bound a kill that happens while the app is in the background, it had never once run in the
 * situation it was written for.
 *
 * The foreground service now beats on its own `HandlerThread`, which has nothing to do with
 * frames. `recoveryBoundAt` takes the later of the two, because each is a moment the app is
 * KNOWN to have been alive and the later one is strictly better information.
 */
test('the native heartbeat carries the bound when the stored one froze', () => {
  // The real shape of the bug: a reader starts a timer, locks the phone, reads for an hour.
  // The stored beat freezes ~12 seconds in; the service keeps beating the whole time.
  const frozen = run({ lastBeatAt: T0 + 12_000 })
  const native = T0 + 60 * MINUTE
  const reopened = T0 + 61 * MINUTE

  assert.equal(recoveryBoundAt(frozen, reopened), T0 + 12_000)
  assert.equal(
    recoveryBoundAt(frozen, reopened, native),
    native,
    'an hour of reading would have been offered as twelve seconds',
  )
})

test('the later heartbeat wins whichever one it is', () => {
  const r = run({ lastBeatAt: T0 + 5 * MINUTE })
  const at = T0 + 30 * MINUTE
  assert.equal(recoveryBoundAt(r, at, T0 + 9 * MINUTE), T0 + 9 * MINUTE)
  assert.equal(recoveryBoundAt(r, at, T0 + 1 * MINUTE), T0 + 5 * MINUTE)
})

test('a native heartbeat from the future is still clamped to now', () => {
  // Same rule as the stored one: a beat later than now is a clock that moved backwards, and
  // trusting it hands the reader a duration longer than the session could possibly be.
  assert.equal(recoveryBoundAt(run({ lastBeatAt: null }), T0 + 1000, T0 + 9_000_000), T0 + 1000)
})

test('no heartbeat at all, from either source, still falls back to now', () => {
  assert.equal(recoveryBoundAt(run({ lastBeatAt: null }), T0 + 1000, 0), T0 + 1000)
  assert.equal(recoveryBoundAt(null, T0 + 1000, 0), T0 + 1000)
})

test('a native beat is ignored when it is not a finite number', () => {
  const r = run({ lastBeatAt: T0 + 5 * MINUTE })
  const at = T0 + 30 * MINUTE
  assert.equal(recoveryBoundAt(r, at, Number.NaN), T0 + 5 * MINUTE)
  assert.equal(recoveryBoundAt(r, at, Number.POSITIVE_INFINITY), T0 + 5 * MINUTE)
})
