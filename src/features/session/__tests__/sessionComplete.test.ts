import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { toLocalDay } from '@/lib/dates'

import { completeSummary, stepEnd, type ReadSessionFact } from '../sessionComplete'
import type { SessionForm } from '../sessionForm'

const at = (y: number, m: number, d: number, h = 21, min = 40) =>
  new Date(y, m - 1, d, h, min).getTime()

const TODAY = '2026-09-13'
const NOW = at(2026, 9, 13)
const TUESDAY = at(2026, 9, 8)

const form = (over: Partial<SessionForm> = {}): SessionForm => ({
  format: 'pages',
  from: '184',
  to: '212',
  occurredAt: NOW,
  ...over,
})

const fact = (
  id: string,
  from: number,
  to: number,
  when: number,
  seconds: number | null = null,
): ReadSessionFact => ({
  id,
  format: 'pages',
  fromPosition: from,
  toPosition: to,
  durationSeconds: seconds,
  occurredAt: when,
  localDay: toLocalDay(when),
})

const base = {
  session: { id: 'me', durationSeconds: null },
  book: { pageCount: 659, totalMinutes: null },
  today: TODAY,
}

describe('the stepper', () => {
  test('moves the end one at a time, never to or before the start', () => {
    assert.equal(stepEnd(form(), 1).to, '213')
    assert.equal(stepEnd(form(), -1).to, '211')
    assert.equal(stepEnd(form({ to: '185' }), -1).to, '185')
    assert.equal(stepEnd(form({ to: '' }), 1).to, '185')
  })
})

describe('what Session complete says', () => {
  test('a logged session leads with its pages and its range', () => {
    const s = completeSummary({ ...base, form: form(), readSessions: [], otherDays: [] })
    assert.equal(s.headline, '28')
    assert.equal(s.headlineUnit, 'pages')
    assert.equal(s.detail, 'Page 184 → 212')
  })

  test('a timed session leads with its duration, and its pages go underneath', () => {
    const s = completeSummary({
      ...base,
      session: { id: 'me', durationSeconds: 2460 },
      form: form(),
      readSessions: [],
      otherDays: [],
    })
    assert.equal(s.headline, '41m')
    assert.equal(s.headlineUnit, null)
    assert.equal(s.detail, '28 pages, 184 → 212')
  })

  test('the percentage is where the read now is, including this session as edited', () => {
    const readSessions = [fact('a', 0, 184, TUESDAY), fact('me', 184, 212, NOW)]
    const s = completeSummary({
      ...base,
      form: form({ to: '329' }),
      readSessions,
      otherDays: [],
    })
    assert.equal(s.fraction, 329 / 659)
  })

  test('time left comes from the reader’s timed sessions; otherwise pages left', () => {
    const timedEarlier = [fact('a', 100, 184, TUESDAY, 84 * 60)] // a minute a page
    const withTime = completeSummary({
      ...base,
      form: form(),
      readSessions: timedEarlier,
      otherDays: [],
    })
    assert.deepEqual(withTime.left, { kind: 'time', seconds: (659 - 212) * 60 })
    const noTimer = completeSummary({ ...base, form: form(), readSessions: [], otherDays: [] })
    assert.deepEqual(noTimer.left, { kind: 'pages', count: 659 - 212 })
    const unknownLength = completeSummary({
      ...base,
      book: { pageCount: null, totalMinutes: null },
      form: form(),
      readSessions: [],
      otherDays: [],
    })
    assert.equal(unknownLength.left, null)
    assert.equal(unknownLength.fraction, null)
  })

  describe('the streak follows the date being chosen, before Done', () => {
    // Read yesterday and the day before. This session is today: a three-day streak.
    const otherDays = ['2026-09-11', '2026-09-12']

    test('dated today, it extends the streak', () => {
      const s = completeSummary({ ...base, form: form(), readSessions: [], otherDays })
      assert.equal(s.streak, 3)
    })

    test('moved to last Tuesday, today no longer counts: the streak drops to two', () => {
      const s = completeSummary({
        ...base,
        form: form({ occurredAt: TUESDAY }),
        readSessions: [],
        otherDays,
      })
      assert.equal(s.streak, 2)
    })

    test('its own saved day is not counted twice or kept after moving it', () => {
      // The saved day (today) is excluded by the query; only the chosen day is added back.
      const alone = completeSummary({
        ...base,
        form: form({ occurredAt: TUESDAY }),
        readSessions: [],
        otherDays: [],
      })
      assert.equal(alone.streak, 0)
    })
  })
})
