/**
 * The timezone tests. This is the whole product thesis in assertion form.
 *
 * Run under a specific zone to prove the boundary cases:
 *   TZ="Asia/Kolkata"    npm test
 *   TZ="America/Chicago" npm test
 *   TZ="UTC"             npm test
 *
 * `local_day` exists precisely so these pass in every zone. A day bucket computed from
 * `date(occurred_at)` fails the 4am case in IST and the 11pm case in Chicago.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addDays, daysBetween, formatDuration, localYearOf, toLocalDay } from '../dates'

/** Builds a UTC ms value for a local wall-clock time in the current TZ. */
function localTime(y: number, m: number, d: number, hh: number, mm = 0): number {
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
}

test('local_day is the calendar day the reader experienced, not the UTC day', () => {
  // 11pm on the 31st. In IST this is 17:30 UTC the same day; in Chicago it is 05:00 UTC
  // on the 1st. Both must report the 31st.
  assert.equal(toLocalDay(localTime(2026, 12, 31, 23, 0)), '2026-12-31')

  // 4am on the 1st. In IST this is 22:30 UTC on the previous day. Must still be the 1st.
  assert.equal(toLocalDay(localTime(2027, 1, 1, 4, 0)), '2027-01-01')

  // Midday is unambiguous everywhere and is the control case.
  assert.equal(toLocalDay(localTime(2026, 6, 15, 12, 0)), '2026-06-15')
})

test("a late-night session on New Year's Eve belongs to the year that was ending", () => {
  assert.equal(localYearOf(localTime(2026, 12, 31, 23, 30)), 2026)
  assert.equal(localYearOf(localTime(2027, 1, 1, 0, 30)), 2027)
})

test('sessions either side of local midnight land on different days', () => {
  const before = toLocalDay(localTime(2026, 9, 3, 23, 59))
  const after = toLocalDay(localTime(2026, 9, 4, 0, 1))
  assert.notEqual(before, after)
  assert.equal(daysBetween(before, after), 1)
})

test('day arithmetic crosses month and year boundaries', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2027-01-01', -1), '2026-12-31')
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
  assert.equal(daysBetween('2026-12-28', '2027-01-04'), 7)
})

test('durations render without mixing units', () => {
  assert.equal(formatDuration(30), '30s')
  assert.equal(formatDuration(60 * 48), '48m')
  assert.equal(formatDuration(60 * 60), '1h')
  assert.equal(formatDuration(60 * 72), '1h 12m')
})
