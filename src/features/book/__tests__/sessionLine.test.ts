/**
 * A SESSION ROW SAYS WHAT WAS READ, AND NEVER HIDES A SESSION THAT COUNTS FOR NOTHING.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sessionLine, type SessionShape } from '../sessionLine'

const pages = (
  from: number | null,
  to: number | null,
  duration: number | null = null,
): SessionShape => ({
  format: 'pages',
  fromPosition: from,
  toPosition: to,
  durationSeconds: duration,
})

test('positions are boundaries: 0 → 10 is ten pages', () => {
  assert.equal(sessionLine(pages(0, 10)).amount, '10 pages · 0 → 10')
})

test('one page is one page, not one pages', () => {
  assert.equal(sessionLine(pages(41, 42)).amount, '1 page · 41 → 42')
})

test('a timed page session shows the pages and, separately, how long', () => {
  const line = sessionLine(pages(184, 212, 41 * 60))
  assert.equal(line.amount, '28 pages · 184 → 212')
  assert.equal(line.duration, '41m')
  assert.equal(line.needsFix, false)
})

test('a recovered session is time read, with nothing to fix', () => {
  const line = sessionLine(pages(null, null, 25 * 60))
  assert.deepEqual(line, { amount: '25m read', duration: null, needsFix: false })
})

test('an audiobook session is time listened, from its minute marks', () => {
  const line = sessionLine({
    format: 'minutes',
    fromPosition: 120,
    toPosition: 165,
    durationSeconds: null,
  })
  assert.equal(line.amount, '45m listened · 120 → 165')
})

test('a backwards session says so and asks to be fixed', () => {
  const line = sessionLine(pages(120, 40))
  assert.equal(line.needsFix, true)
  assert.match(line.amount, /backwards/)
})

test('a half-filled session says which end is missing', () => {
  assert.equal(sessionLine(pages(30, null)).amount, 'From page 30, no end')
  assert.equal(sessionLine(pages(null, 30)).amount, 'To page 30, no start')
  assert.equal(sessionLine(pages(30, null)).needsFix, true)
})

test('a session with nothing at all is flagged, never shown as zero', () => {
  assert.deepEqual(sessionLine(pages(null, null)), {
    amount: 'Nothing recorded',
    duration: null,
    needsFix: true,
  })
})
