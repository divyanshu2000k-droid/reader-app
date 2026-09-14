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

import {
  addDays,
  daysBetween,
  formatDuration,
  formatWhen,
  localYearOf,
  takeLocalDate,
  takeLocalTime,
  toLocalDay,
  withLocalDate,
  withLocalTime,
} from '../dates'

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

// ─── EDITING A SESSION'S INSTANT (Slice 3) ───────────────────────────────────

test('picking another day keeps the local time of day, and lands on that local day', () => {
  // Logged now (a Sunday evening), backdated to last Tuesday: 9:40 pm last Tuesday, and its
  // local_day is Tuesday in every zone.
  const logged = localTime(2026, 9, 13, 21, 40)
  const moved = withLocalDate(logged, 2026, 9, 8)
  assert.equal(toLocalDay(moved), '2026-09-08')
  assert.equal(new Date(moved).getHours(), 21)
  assert.equal(new Date(moved).getMinutes(), 40)
})

test('the 11pm and 4am cases survive a date pick then a time pick', () => {
  const base = localTime(2026, 9, 13, 12, 0)
  const late = withLocalTime(withLocalDate(base, 2026, 12, 31), 23, 0)
  assert.equal(toLocalDay(late), '2026-12-31')
  assert.equal(localYearOf(late), 2026)
  const early = withLocalTime(withLocalDate(base, 2027, 1, 1), 4, 0)
  assert.equal(toLocalDay(early), '2027-01-01')
  // Picking the time never moves the day, even when the new time crosses a UTC midnight.
  assert.equal(toLocalDay(withLocalTime(late, 0, 30)), '2026-12-31')
})

test('picking a time drops seconds, so an edited session is to the minute', () => {
  const t = withLocalTime(new Date(2026, 8, 13, 10, 5, 42, 123).getTime(), 9, 40)
  assert.equal(new Date(t).getSeconds(), 0)
  assert.equal(new Date(t).getMilliseconds(), 0)
})

test('a date pick across a DST change keeps the wall clock, not the elapsed hours', () => {
  // US Central changes on 2026-11-01. Under UTC and IST there is no change and this is a
  // control; under America/Chicago adding 24h would give 8:40 pm.
  const before = localTime(2026, 10, 31, 21, 40)
  const after = withLocalDate(before, 2026, 11, 2)
  assert.equal(new Date(after).getHours(), 21)
  assert.equal(toLocalDay(after), '2026-11-02')
})

test('formatWhen names the day the reader remembers', () => {
  const today = '2026-09-13'
  assert.equal(formatWhen(localTime(2026, 9, 13, 21, 40), today), 'Today, 9:40 pm')
  assert.equal(formatWhen(localTime(2026, 9, 12, 7, 5), today), 'Yesterday, 7:05 am')
  assert.equal(formatWhen(localTime(2026, 9, 8, 23, 0), today), 'Tue 8 Sep, 11:00 pm')
  assert.equal(formatWhen(localTime(2025, 12, 31, 23, 0), today), 'Wed 31 Dec 2025, 11:00 pm')
})

test('a picked date keeps the session time; a picked time keeps the session day', () => {
  const session = localTime(2026, 9, 13, 21, 40)
  // The date picker hands back its own time of day (here 08:15), which must be ignored.
  const picked = localTime(2026, 9, 8, 8, 15)
  const onTuesday = takeLocalDate(session, picked)
  assert.equal(toLocalDay(onTuesday), '2026-09-08')
  assert.equal(new Date(onTuesday).getHours(), 21)
  // The time picker hands back an instant on some other day, which must be ignored.
  const at4am = takeLocalTime(onTuesday, localTime(2030, 1, 1, 4, 5))
  assert.equal(toLocalDay(at4am), '2026-09-08')
  assert.equal(new Date(at4am).getHours(), 4)
  assert.equal(new Date(at4am).getMinutes(), 5)
})
