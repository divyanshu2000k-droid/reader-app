/**
 * Statistics aggregation. The assertion that matters most is that pages and minutes
 * never combine — the largest unmet complaint in the category.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ProgressSession } from '../progress'
import {
  currentPosition,
  isBackwards,
  percentComplete,
  secondsLeft,
  sessionAmount,
} from '../progress'
import {
  activeDays,
  contribution,
  dailyTotals,
  lastDays,
  totals,
  totalsForYear,
} from '../stats'
import { currentStreak, goalProgress, longestStreak } from '../streaks'

function s(
  localDay: string,
  format: 'pages' | 'minutes',
  from: number,
  to: number,
): ProgressSession {
  return {
    localDay,
    format,
    fromPosition: from,
    toPosition: to,
    durationSeconds: null,
    occurredAt: 0,
  }
}

/** A timed session: a duration, and positions only if the reader gave them. */
function timed(
  localDay: string,
  format: 'pages' | 'minutes',
  seconds: number,
  from: number | null = null,
  to: number | null = null,
): ProgressSession {
  return {
    localDay,
    format,
    fromPosition: from,
    toPosition: to,
    durationSeconds: seconds,
    occurredAt: 0,
  }
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
  // should stop it. `unusable` is a count of rows, not a quantity of reading, so it
  // cannot be confused with either.
  assert.equal(Object.keys(t).sort().join(','), 'minutes,pages,unusable')
  assert.equal(t.unusable, 0)
})

test('an audiobook session never inflates the page count', () => {
  const audioOnly = [s('2026-09-01', 'minutes', 0, 600)]
  assert.equal(totals(audioOnly).pages, 0)
  // NULL, not 0: "no page data" and "on page 0" are different facts and the UI shows
  // them differently. Returning 0 here printed "page 0" for a book ten hours in.
  assert.equal(currentPosition(audioOnly, 'pages'), null)
})

test('daily totals bucket by local day and keep the formats apart', () => {
  const days = dailyTotals(mixed)
  assert.equal(days.length, 3)
  assert.deepEqual(days[0], { day: '2026-09-01', pages: 40, minutes: 35, unusable: 0 })
  assert.deepEqual(days[1], { day: '2026-09-02', pages: 50, minutes: 0, unusable: 0 })
  assert.deepEqual(days[2], { day: '2026-09-04', pages: 0, minutes: 60, unusable: 0 })
})

test('yearly totals use the local day, so a New Year session lands correctly', () => {
  const across = [s('2026-12-31', 'pages', 0, 20), s('2027-01-01', 'pages', 20, 45)]
  assert.equal(totalsForYear(across, 2026).pages, 20)
  assert.equal(totalsForYear(across, 2027).pages, 25)
})

test('current position is the furthest reached, not the last logged', () => {
  const out_of_order = [s('2026-09-03', 'pages', 100, 140), s('2026-09-01', 'pages', 0, 40)]
  assert.equal(currentPosition(out_of_order, 'pages'), 140)
})

test('a backwards session is reported, never silently discarded', () => {
  // Page 120 to page 40: almost always a typo. It used to clamp to zero and vanish from
  // every total, leaving the reader with a pages number they could not reconcile
  // against their own session list and no way to find the row responsible.
  const backwards = s('2026-09-01', 'pages', 120, 40)
  assert.equal(isBackwards(backwards), true)
  assert.equal(sessionAmount(backwards), null)

  const t = totals([s('2026-09-01', 'pages', 0, 40), backwards])
  assert.equal(t.pages, 40, 'the good session still counts')
  assert.equal(t.unusable, 1, 'and the bad one is surfaced rather than dropped')
})

test('a half-finished session is unusable rather than zero', () => {
  const open: ProgressSession = {
    localDay: '2026-09-01',
    format: 'pages',
    fromPosition: 30,
    toPosition: null,
    durationSeconds: null,
    occurredAt: 0,
  }
  assert.equal(sessionAmount(open), null)
  assert.equal(totals([open]).unusable, 1)
})

/**
 * THE RECOVERED SESSION, in the direction the decision runs. It carries a duration the
 * reader confirmed and no positions. It used to land in `unusable` and count nowhere,
 * because positions were the only measure this code knew.
 */
test('a recovered session counts fully in time, not at all in pages, and is never unusable', () => {
  assert.deepEqual(totals([timed('2026-09-10', 'pages', 25 * 60)]), {
    pages: 0,
    minutes: 25,
    unusable: 0,
  })
  assert.deepEqual(contribution(timed('2026-09-10', 'pages', 25 * 60)), {
    pages: 0,
    minutes: 25,
    unusable: false,
  })
})

test('a timed paper session counts pages from positions and time from its duration, apart', () => {
  const t = totals([timed('2026-09-10', 'pages', 40 * 60, 0, 30)])
  assert.deepEqual(t, { pages: 30, minutes: 40, unusable: 0 })
  assert.equal(Object.keys(t).sort().join(','), 'minutes,pages,unusable')
})

test('a timed audiobook counts its duration, never its span as well', () => {
  // 45 minutes of book in 30 minutes of listening, at 1.5x. Time read is 30.
  assert.equal(totals([timed('2026-09-10', 'minutes', 30 * 60, 0, 45)]).minutes, 30)
})

test('an audiobook logged by hand counts its minute span as time', () => {
  assert.equal(totals([s('2026-09-10', 'minutes', 120, 165)]).minutes, 45)
})

test('a session with no positions and no duration is unusable, not a silent zero', () => {
  const nothing: ProgressSession = {
    localDay: '2026-09-10',
    format: 'pages',
    fromPosition: null,
    toPosition: null,
    durationSeconds: null,
    occurredAt: 0,
  }
  assert.deepEqual(totals([nothing]), { pages: 0, minutes: 0, unusable: 1 })
})

/**
 * THE OFF-BY-ONE. `from` is the last page finished BEFORE the session. Reading pages 1 to
 * 10 is logged 0 → 10: ten pages. The next session starts at 10, so a chain of sessions
 * sums to the page reached, with no gap and no page counted twice.
 */
test('reading pages 1 to 10 is 0 → 10, ten pages, and sessions chain without a gap', () => {
  assert.equal(totals([s('2026-09-10', 'pages', 0, 10)]).pages, 10)
  const chain = [s('2026-09-10', 'pages', 0, 10), s('2026-09-11', 'pages', 10, 25)]
  assert.equal(totals(chain).pages, 25)
  assert.equal(currentPosition(chain, 'pages'), 25)
})

test('daily totals carry timed minutes on the day they were read', () => {
  const days = dailyTotals([
    s('2026-09-10', 'pages', 0, 10),
    timed('2026-09-10', 'pages', 1500),
  ])
  assert.deepEqual(days, [{ day: '2026-09-10', pages: 10, minutes: 25, unusable: 0 }])
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

// ─── SLICE 3: SESSION COMPLETE AND THE PACE CHART ────────────────────────────

test('time left for an audiobook is its remaining minutes', () => {
  assert.equal(secondsLeft([], 'minutes', 360, 600), 240 * 60)
})

test('time left for a print book comes only from the reader’s own timed page sessions', () => {
  // 50 pages in 3000 s is 60 s a page; 100 pages left is 6000 s.
  const sessions = [
    timed('2026-09-01', 'pages', 3000, 100, 150),
    s('2026-09-02', 'pages', 150, 200),
  ]
  assert.equal(secondsLeft(sessions, 'pages', 200, 300), 6000)
})

test('no timed page session means no estimate, never an average reader’s speed', () => {
  assert.equal(secondsLeft([s('2026-09-01', 'pages', 0, 50)], 'pages', 50, 300), null)
  // A recovered session is time with no pages: it cannot say how fast pages go.
  assert.equal(secondsLeft([timed('2026-09-01', 'pages', 1800)], 'pages', 50, 300), null)
  // An audiobook timer says nothing about print speed either.
  assert.equal(
    secondsLeft([timed('2026-09-01', 'minutes', 1800, 0, 30)], 'pages', 50, 300),
    null,
  )
})

test('no time left without a length, or once the end is reached or passed', () => {
  assert.equal(secondsLeft([], 'minutes', 100, null), null)
  assert.equal(secondsLeft([], 'minutes', null, 600), null)
  assert.equal(secondsLeft([], 'minutes', 600, 600), null)
  assert.equal(secondsLeft([], 'minutes', 700, 600), null)
})

test('the pace window has a bar for every day, zero where nothing was read', () => {
  const window = lastDays(dailyTotals(mixed), '2026-09-04', 5)
  assert.deepEqual(
    window.map((d) => [d.day, d.pages, d.minutes]),
    [
      ['2026-08-31', 0, 0],
      ['2026-09-01', 40, 35],
      ['2026-09-02', 50, 0],
      ['2026-09-03', 0, 0],
      ['2026-09-04', 0, 60],
    ],
  )
})

test('the pace window crosses a month and a year boundary by local day', () => {
  const window = lastDays([], '2027-01-01', 3)
  assert.deepEqual(
    window.map((d) => d.day),
    ['2026-12-30', '2026-12-31', '2027-01-01'],
  )
})
