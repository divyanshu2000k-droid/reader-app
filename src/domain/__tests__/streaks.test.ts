/**
 * Streak boundary tests.
 *
 * The rule under test: with D as the most recent day having a session, the streak is
 * alive on D and D+1 and zero from D+2. It breaks at LOCAL midnight beginning D+2 —
 * after one full calendar day with nothing.
 *
 * Every day here comes from `toLocalDay` on a real timestamp rather than a hand-written
 * string, because a hand-written string would pass even if `toLocalDay` bucketed in UTC.
 * That is the bug these tests exist to catch.
 *
 * Run under each zone:
 *   TZ="Asia/Kolkata"    npx tsx --test src/domain/__tests__/streaks.test.ts
 *   TZ="America/Chicago" npx tsx --test src/domain/__tests__/streaks.test.ts
 *   TZ="UTC"             npx tsx --test src/domain/__tests__/streaks.test.ts
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { toLocalDay } from '@/lib/dates'
import { currentStreak } from '../streaks'

/** A UTC ms value for a local wall-clock time in whatever zone the test runs under. */
function at(y: number, m: number, d: number, hh: number, mm = 0): number {
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
}

test('an 11pm session on the 31st keeps the streak alive on the 1st', () => {
  // In IST this timestamp is 17:30 UTC on the 31st; in Chicago it is 05:00 UTC on the
  // 1st. Under a UTC bucket the Chicago case would file it as the 1st and the reader
  // would be credited for a day they had not yet read. local_day prevents that.
  const lateOnTheThirtyFirst = toLocalDay(at(2026, 12, 31, 23, 0))
  assert.equal(lateOnTheThirtyFirst, '2026-12-31')

  const newYearsDay = toLocalDay(at(2027, 1, 1, 9, 0))
  assert.equal(newYearsDay, '2027-01-01')

  // Read late on the 31st, opened the app on the 1st without reading yet: still alive.
  assert.equal(currentStreak([lateOnTheThirtyFirst], newYearsDay), 1)
})

test('a gap of one full local day breaks the streak', () => {
  const lateOnTheThirtyFirst = toLocalDay(at(2026, 12, 31, 23, 0))
  // The 1st passed with no session. On the 2nd the streak is gone.
  const theSecond = toLocalDay(at(2027, 1, 2, 9, 0))
  assert.equal(theSecond, '2027-01-02')

  assert.equal(currentStreak([lateOnTheThirtyFirst], theSecond), 0)
})

test('no session yesterday and none today is broken, not alive', () => {
  const days = [
    toLocalDay(at(2026, 9, 1, 21, 0)),
    toLocalDay(at(2026, 9, 2, 21, 0)),
    toLocalDay(at(2026, 9, 3, 21, 0)),
  ]

  // Read today: alive, counting the full run.
  assert.equal(currentStreak(days, toLocalDay(at(2026, 9, 3, 22, 0))), 3)
  // Not read today, but read yesterday: the one grace day. Alive.
  assert.equal(currentStreak(days, toLocalDay(at(2026, 9, 4, 22, 0))), 3)
  // Neither today nor yesterday: broken. There is never a second grace day.
  assert.equal(currentStreak(days, toLocalDay(at(2026, 9, 5, 22, 0))), 0)
  assert.equal(currentStreak(days, toLocalDay(at(2026, 9, 12, 22, 0))), 0)
})

test('the streak breaks at local midnight beginning D+2, not at the midnight after D', () => {
  const lastRead = toLocalDay(at(2026, 6, 10, 22, 30))

  // 00:01 the following day. One minute past local midnight after D, still alive.
  assert.equal(currentStreak([lastRead], toLocalDay(at(2026, 6, 11, 0, 1))), 1)
  // 23:59 that same grace day. Still alive.
  assert.equal(currentStreak([lastRead], toLocalDay(at(2026, 6, 11, 23, 59))), 1)
  // 00:01 the day after that. The grace day has fully elapsed. Broken.
  assert.equal(currentStreak([lastRead], toLocalDay(at(2026, 6, 12, 0, 1))), 0)
})

test('a session before local midnight and one after count as two separate days', () => {
  const before = toLocalDay(at(2026, 9, 3, 23, 50))
  const after = toLocalDay(at(2026, 9, 4, 0, 10))
  assert.notEqual(before, after)
  assert.equal(currentStreak([before, after], after), 2)
})

test('a run counts back only through consecutive days, ignoring an older cluster', () => {
  const days = [
    toLocalDay(at(2026, 5, 1, 20, 0)),
    toLocalDay(at(2026, 5, 2, 20, 0)),
    // gap
    toLocalDay(at(2026, 5, 10, 20, 0)),
    toLocalDay(at(2026, 5, 11, 20, 0)),
    toLocalDay(at(2026, 5, 12, 20, 0)),
  ]
  assert.equal(currentStreak(days, toLocalDay(at(2026, 5, 12, 21, 0))), 3)
})

test('an empty history is zero, and duplicate days on one date count once', () => {
  assert.equal(currentStreak([], toLocalDay(at(2026, 9, 3, 12, 0))), 0)

  const sameDay = toLocalDay(at(2026, 9, 3, 9, 0))
  const alsoSameDay = toLocalDay(at(2026, 9, 3, 21, 0))
  assert.equal(sameDay, alsoSameDay)
  // Three sessions in one day is a one-day streak, not three.
  assert.equal(currentStreak([sameDay, alsoSameDay, sameDay], sameDay), 1)
})

test('the streak survives a DST transition', () => {
  // Late March and late October carry the European and US transitions. Under a manual
  // setDate walk this is where an off-by-one appears; date-fns handles it.
  const days = [
    toLocalDay(at(2027, 3, 27, 21, 0)),
    toLocalDay(at(2027, 3, 28, 21, 0)),
    toLocalDay(at(2027, 3, 29, 21, 0)),
  ]
  assert.equal(currentStreak(days, toLocalDay(at(2027, 3, 29, 22, 0))), 3)

  const autumn = [
    toLocalDay(at(2027, 10, 30, 21, 0)),
    toLocalDay(at(2027, 10, 31, 21, 0)),
    toLocalDay(at(2027, 11, 1, 21, 0)),
  ]
  assert.equal(currentStreak(autumn, toLocalDay(at(2027, 11, 1, 22, 0))), 3)
})
