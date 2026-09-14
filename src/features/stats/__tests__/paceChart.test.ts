import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ProgressSession } from '@/domain/progress'
import { dailyTotals } from '@/domain/stats'
import { toLocalDay } from '@/lib/dates'

import { paceChart } from '../paceChart'

const at = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime()

function session(
  when: number,
  format: 'pages' | 'minutes',
  from: number,
  to: number,
): ProgressSession {
  return {
    format,
    fromPosition: from,
    toPosition: to,
    durationSeconds: null,
    occurredAt: when,
    localDay: toLocalDay(when),
  }
}

const TODAY = '2026-09-13'

test('a session logged for last Tuesday stands on Tuesday', () => {
  const chart = paceChart(
    dailyTotals([session(at(2026, 9, 8, 21, 40), 'pages', 184, 212)]),
    TODAY,
    'pages',
  )
  assert.equal(chart.bars.length, 14)
  const tuesday = chart.bars.find((b) => b.day === '2026-09-08')
  assert.equal(tuesday?.value, 28)
  assert.equal(tuesday?.fraction, 1)
  assert.equal(chart.bars.filter((b) => b.value > 0).length, 1)
  assert.equal(chart.bars.at(-1)?.day, TODAY)
  assert.equal(chart.bars.at(-1)?.isToday, true)
})

test('editing its date moves the bar: the same session on Thursday is a Thursday bar', () => {
  const before = paceChart(
    dailyTotals([session(at(2026, 9, 8, 21, 40), 'pages', 184, 212)]),
    TODAY,
    'pages',
  )
  const after = paceChart(
    dailyTotals([session(at(2026, 9, 10, 21, 40), 'pages', 184, 212)]),
    TODAY,
    'pages',
  )
  assert.equal(before.bars.find((b) => b.day === '2026-09-10')?.value, 0)
  assert.equal(after.bars.find((b) => b.day === '2026-09-08')?.value, 0)
  assert.equal(after.bars.find((b) => b.day === '2026-09-10')?.value, 28)
})

test('11pm and 4am sessions land on the reader’s day, not the UTC day', () => {
  const chart = paceChart(
    dailyTotals([
      session(at(2026, 9, 11, 23, 0), 'pages', 0, 10),
      session(at(2026, 9, 12, 4, 0), 'pages', 10, 30),
    ]),
    TODAY,
    'pages',
  )
  assert.equal(chart.bars.find((b) => b.day === '2026-09-11')?.value, 10)
  assert.equal(chart.bars.find((b) => b.day === '2026-09-12')?.value, 20)
})

test('pages and time are separate charts: an audiobook never shows as pages', () => {
  const days = dailyTotals([
    session(at(2026, 9, 12, 9), 'pages', 0, 40),
    session(at(2026, 9, 12, 20), 'minutes', 0, 90),
  ])
  assert.equal(paceChart(days, TODAY, 'pages').total, 40)
  assert.equal(paceChart(days, TODAY, 'minutes').total, 90)
})

test('bars are relative to the busiest day, and an empty window says so', () => {
  const days = dailyTotals([
    session(at(2026, 9, 12, 9), 'pages', 0, 100),
    session(at(2026, 9, 13, 9), 'pages', 100, 125),
  ])
  const chart = paceChart(days, TODAY, 'pages')
  assert.equal(chart.bars.find((b) => b.day === '2026-09-13')?.fraction, 0.25)
  assert.equal(chart.empty, false)
  const none = paceChart([], TODAY, 'pages')
  assert.equal(none.empty, true)
  assert.ok(none.bars.every((b) => b.fraction === 0))
})

test('reading older than the window is not drawn in it', () => {
  const chart = paceChart(
    dailyTotals([session(at(2026, 8, 1, 9), 'pages', 0, 50)]),
    TODAY,
    'pages',
  )
  assert.equal(chart.empty, true)
})
