/**
 * THE TIMER'S NUMBER IS DERIVED FROM TIMESTAMPS, NEVER COUNTED.
 *
 * The failure this guards against does not throw and does not look wrong: a ticking counter
 * that stops incrementing while the screen is off under-counts exactly the reading it exists
 * to measure. Every assertion here is about a span the app did not witness.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  RING_SWEEP_SECONDS,
  elapsedSeconds,
  formatClock,
  pause,
  resume,
  ringFraction,
  start,
  startedAt,
  status,
  stop,
  type TimerSession,
} from '../timerState'

const T0 = 1_700_000_000_000
const session = (segments: { startedAt: number; endedAt: number | null }[]): TimerSession => ({
  sessionId: 's1',
  readId: 'r1',
  bookId: 'b1',
  segments,
})

// ─── THE NUMBER ──────────────────────────────────────────────────────────────

test('a running session counts to now, including time the app was not awake for', () => {
  const s = session([{ startedAt: T0, endedAt: null }])
  // Nine minutes of which the app witnessed none: the screen was off.
  assert.equal(elapsedSeconds(s, T0 + 9 * 60_000), 540)
})

test('paused time is not reading, and is not counted', () => {
  const s = session([
    { startedAt: T0, endedAt: T0 + 60_000 }, // one minute read
    { startedAt: T0 + 600_000, endedAt: null }, // paused nine, then reading again
  ])
  // At ten minutes past the resume: 1 minute + 10 minutes, NOT the 19 minutes of wall time.
  assert.equal(elapsedSeconds(s, T0 + 1_200_000), 60 + 600)
})

test('a finished session reads the same however long afterwards it is asked', () => {
  const s = session([{ startedAt: T0, endedAt: T0 + 120_000 }])
  assert.equal(elapsedSeconds(s, T0 + 120_000), 120)
  assert.equal(elapsedSeconds(s, T0 + 999_000_000), 120)
})

test('seconds are whole, and round down: a timer never claims a second it did not have', () => {
  assert.equal(elapsedSeconds(session([{ startedAt: T0, endedAt: T0 + 1999 }]), T0), 1)
})

// ─── THE CLOCK CAN GO BACKWARDS ──────────────────────────────────────────────

test('a clock that moves backwards never produces a negative duration', () => {
  const s = session([{ startedAt: T0, endedAt: null }])
  assert.equal(elapsedSeconds(s, T0 - 3_600_000), 0)
})

test('pausing after a backwards clock jump closes the segment at zero, not in reverse', () => {
  const s = session([{ startedAt: T0, endedAt: null }])
  const paused = pause(s, T0 - 60_000)
  assert.deepEqual(paused, [{ startedAt: T0, endedAt: T0 }])
  assert.equal(elapsedSeconds(session([...(paused ?? [])]), T0 + 999), 0)
})

test('a nonsense timestamp contributes nothing rather than NaN', () => {
  const s = session([{ startedAt: Number.NaN, endedAt: null }])
  assert.equal(elapsedSeconds(s, T0), 0)
})

// ─── TRANSITIONS ─────────────────────────────────────────────────────────────

test('starting opens one segment', () => {
  assert.deepEqual(start(T0), [{ startedAt: T0, endedAt: null }])
  assert.equal(status(session([...start(T0)])), 'running')
})

test('pause then resume leaves the first segment closed and a new one open', () => {
  const running = session([{ startedAt: T0, endedAt: null }])
  const paused = pause(running, T0 + 60_000)
  assert.ok(paused)
  assert.equal(status(session([...paused])), 'paused')
  const resumed = resume(session([...paused]), T0 + 120_000)
  assert.ok(resumed)
  assert.equal(resumed.length, 2)
  assert.equal(status(session([...resumed])), 'running')
})

test('a second tap on Pause is the second tap, not an error', () => {
  const paused = session([{ startedAt: T0, endedAt: T0 + 1000 }])
  assert.equal(pause(paused, T0 + 2000), null)
})

test('a second tap on Resume does not open two segments', () => {
  const running = session([{ startedAt: T0, endedAt: null }])
  assert.equal(resume(running, T0 + 1000), null)
})

test('stopping always leaves nothing open, from either state', () => {
  const running = session([{ startedAt: T0, endedAt: null }])
  assert.equal(
    stop(running, T0 + 5000).every((s) => s.endedAt !== null),
    true,
  )
  const paused = session([{ startedAt: T0, endedAt: T0 + 5000 }])
  assert.deepEqual(stop(paused, T0 + 9000), paused.segments)
})

test('the saved duration cannot change after stopping', () => {
  const stopped = session([...stop(session([{ startedAt: T0, endedAt: null }]), T0 + 90_000)])
  assert.equal(elapsedSeconds(stopped, T0 + 90_000), 90)
  assert.equal(elapsedSeconds(stopped, T0 + 90_000_000), 90)
})

test('when the session began is the FIRST segment, not the current one', () => {
  const s = session([
    { startedAt: T0, endedAt: T0 + 1000 },
    { startedAt: T0 + 5000, endedAt: null },
  ])
  assert.equal(startedAt(s), T0)
  assert.equal(startedAt(session([])), null)
})

// ─── WHAT IS SHOWN ───────────────────────────────────────────────────────────

test('the clock reads MM:SS under an hour and H:MM:SS past it', () => {
  assert.equal(formatClock(0), '00:00')
  assert.equal(formatClock(9), '00:09')
  assert.equal(formatClock(252), '04:12') // the artboard
  assert.equal(formatClock(3599), '59:59')
  assert.equal(formatClock(3600), '1:00:00')
  assert.equal(formatClock(3661), '1:01:01')
  assert.equal(formatClock(36000), '10:00:00')
})

test('the clock never shows a negative time', () => {
  assert.equal(formatClock(-5), '00:00')
})

test('the ring sweeps once over an hour and then HOLDS, rather than resetting', () => {
  assert.equal(ringFraction(0), 0)
  assert.equal(ringFraction(RING_SWEEP_SECONDS / 2), 0.5)
  assert.equal(ringFraction(RING_SWEEP_SECONDS), 1)
  // A ring that wrapped would look exactly like a timer that restarted.
  assert.equal(ringFraction(RING_SWEEP_SECONDS * 3), 1)
})

test('the ring is empty for a nonsense time rather than NaN-filled', () => {
  assert.equal(ringFraction(Number.NaN), 0)
  assert.equal(ringFraction(-10), 0)
})
