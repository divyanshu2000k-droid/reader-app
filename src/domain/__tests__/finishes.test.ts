/**
 * Which year a finished read counts in. Timezone-sensitive: run by `npm run test:tz` under UTC,
 * IST and US Central, because a UTC bucket files an 11 pm New Year's Eve finish in Chicago under
 * the next year.
 */

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { effectiveFinishedAt, finishedInYear, ordinal, type FinishedRead } from '../finishes'

/** A UTC ms value for a local wall-clock time in whatever zone the test runs under. */
function at(y: number, m: number, d: number, hh = 12, mm = 0): number {
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
}

function read(overrides: Partial<FinishedRead> & { readId: string }): FinishedRead {
  return { status: 'finished', finishedAt: null, lastSessionAt: null, ...overrides }
}

describe('when a read was finished', () => {
  test("the reader's date wins over the last session", () => {
    assert.equal(
      effectiveFinishedAt(
        read({ readId: 'r', finishedAt: at(2026, 3, 1), lastSessionAt: at(2026, 2, 1) }),
      ),
      at(2026, 3, 1),
    )
  })

  test('with no date of its own, the last session', () => {
    assert.equal(
      effectiveFinishedAt(read({ readId: 'r', lastSessionAt: at(2026, 2, 1) })),
      at(2026, 2, 1),
    )
  })

  test('a read that is not finished has no finish date, even with one stored', () => {
    for (const status of ['reading', 'want', 'dnf'] as const) {
      assert.equal(
        effectiveFinishedAt(read({ readId: 'r', status, finishedAt: at(2026, 3, 1) })),
        null,
      )
    }
  })

  test('a finished read with no date and no sessions has none, rather than today', () => {
    assert.equal(effectiveFinishedAt(read({ readId: 'r' })), null)
  })
})

describe('counting finished reads by year', () => {
  // One book read twice: finished last New Year's Eve at 11 pm, and again in March.
  const first = read({ readId: 'read-1', finishedAt: at(2025, 12, 31, 23, 0) })
  const second = read({ readId: 'read-2', finishedAt: at(2026, 3, 1) })

  test('two reads of one book each count once, in their own year', () => {
    assert.equal(finishedInYear([first, second], 2025), 1)
    assert.equal(finishedInYear([first, second], 2026), 1)
    assert.equal(finishedInYear([first, second], 2024), 0)
  })

  test('an 11 pm New Year’s Eve finish is last year in every time zone', () => {
    assert.equal(finishedInYear([first], 2025), 1)
    assert.equal(finishedInYear([first], 2026), 0)
  })

  test('a date from the last session counts like a stored one', () => {
    const derived = read({ readId: 'd', lastSessionAt: at(2026, 5, 5) })
    assert.equal(finishedInYear([derived], 2026), 1)
  })

  test('DNF and undated finishes count in no year', () => {
    const dnf = read({ readId: 'x', status: 'dnf', lastSessionAt: at(2026, 5, 5) })
    const undated = read({ readId: 'u' })
    assert.equal(finishedInYear([dnf, undated], 2026), 0)
  })

  test('the read being finished is left out, so it is counted once at its new date', () => {
    assert.equal(finishedInYear([first, second], 2026, 'read-2'), 0)
    assert.equal(finishedInYear([first, second], 2025, 'read-2'), 1)
  })
})

test('ordinals, including the teens', () => {
  const cases: [number, string][] = [
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [31, '31st'],
    [101, '101st'],
    [111, '111th'],
    [112, '112th'],
  ]
  for (const [n, text] of cases) assert.equal(ordinal(n), text)
})
