/**
 * Statistics aggregation. The assertion that matters most is that pages and minutes
 * never combine — the largest unmet complaint in the category.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ProgressSession } from '../progress'
import { currentPosition, percentComplete } from '../progress'
import { activeDays, dailyTotals, totals, totalsForYear } from '../stats'
import { currentStreak, goalProgress, longestStreak } from '../streaks'

function s(
  localDay: string,
  format: 'pages' | 'minutes',
  from: number,
  to: number,
): ProgressSession {
  return { localDay, format, fromPosition: from, toPosition: to, occurredAt: 0 }
}

const mixed: ProgressSession[] = [
  s('2026-09-01', 'pages', 0, 40),
  s('2026-09-01', 'minutes', 0, 35),
  s('2026-09-02', 'pages', 40, 90),
  s('2026-09-04', 'minutes', 35, 95),
]

test('pages and minutes are never summed into one number', () => {
  const t = totals(mixed)
  assert.equal(t.pages, 90)
  assert.equal(t.minutes, 95)
  // There is deliberately no combined total. If one ever appears, this is the test that
  // should stop it.
  assert.equal(Object.keys(t).sort().join(','), 'minutes,pages')
})

test('an audiobook session never inflates the page count', () => {
  const audioOnly = [s('2026-09-01', 'minutes', 0, 600)]
  assert.equal(totals(audioOnly).pages, 0)
  assert.equal(currentPosition(audioOnly, 'pages'), 0)
})

test('daily totals bucket by local day and keep the formats apart', () => {
  const days = dailyTotals(mixed)
  assert.equal(days.length, 3)
  assert.deepEqual(days[0], { day: '2026-09-01', pages: 40, minutes: 35 })
  assert.deepEqual(days[1], { day: '2026-09-02', pages: 50, minutes: 0 })
  assert.deepEqual(days[2], { day: '2026-09-04', pages: 0, minutes: 60 })
})

test('yearly totals use the local day, so a New Year session lands correctly', () => {
  const across = [
    s('2026-12-31', 'pages', 0, 20),
    s('2027-01-01', 'pages', 20, 45),
  ]
  assert.equal(totalsForYear(across, 2026).pages, 20)
  assert.equal(totalsForYear(across, 2027).pages, 25)
})

test('current position is the furthest reached, not the last logged', () => {
  const out_of_order = [
    s('2026-09-03', 'pages', 100, 140),
    s('2026-09-01', 'pages', 0, 40),
  ]
  assert.equal(currentPosition(out_of_order, 'pages'), 140)
})

test('percent complete is null when the page count is unknown, never a misleading zero', () => {
  assert.equal(percentComplete(120, null), null)
  assert.equal(percentComplete(120, 0), null)
  assert.equal(percentComplete(120, 240), 0.5)
})

test('percent complete clamps, because API page counts are frequently wrong', () => {
  assert.equal(percentComplete(320, 300), 1)
})

test('streaks count consecutive local days and tolerate today being unread', () => {
  const days = ['2026-09-01', '2026-09-02', '2026-09-03']
  // Read today: streak runs to today.
  assert.equal(currentStreak(days, '2026-09-03'), 3)
  // Not read yet today, but read yesterday: the streak is intact, not broken.
  assert.equal(currentStreak(days, '2026-09-04'), 3)
  // Two days idle: broken.
  assert.equal(currentStreak(days, '2026-09-05'), 0)
})

test('longest streak finds the best run anywhere in the history', () => {
  assert.equal(
    longestStreak(['2026-01-01', '2026-01-02', '2026-03-01', '2026-03-02', '2026-03-03']),
    3,
  )
})

test('active days are unique and sorted, ready for the streak calculation', () => {
  assert.deepEqual(activeDays(mixed), ['2026-09-01', '2026-09-02', '2026-09-04'])
})

test('lowering a goal below current progress reads as met, not as failure', () => {
  const p = goalProgress(10, 14)
  assert.equal(p?.met, true)
  assert.equal(p?.targetBelowProgress, true)
  assert.equal(p?.fraction, 1)
})

test('no goal set still returns null rather than gating anything', () => {
  assert.equal(goalProgress(null, 14), null)
})
