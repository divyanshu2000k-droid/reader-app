/**
 * The three numbers, and the year switcher that sits above them.
 *
 * The case that matters most here is the one where books and sessions DISAGREE about which
 * year something belongs to — a book started in December and finished in January. Both
 * answers are right, they answer different questions, and a screen that smooths them
 * together is lying about one of them.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isEmptyYear, yearSummary, yearsToOffer } from '../yearSummary'
import type { FinishedRead } from '@/domain/finishes'
import type { ProgressSession } from '@/domain/progress'
import type { LocalDay } from '@/lib/dates'

/** 2025-12-20 and 2026-01-05, local, as unix ms. Built from the day so the two agree. */
const DEC_2025 = Date.parse('2025-12-20T10:00:00')
const JAN_2026 = Date.parse('2026-01-05T10:00:00')

function session(day: string, pages: number, minutes = 0): ProgressSession {
  return {
    format: 'pages',
    fromPosition: 0,
    toPosition: pages,
    durationSeconds: minutes === 0 ? null : minutes * 60,
    occurredAt: Date.parse(`${day}T10:00:00`),
    localDay: day as LocalDay,
  }
}

function finished(readId: string, at: number | null): FinishedRead {
  return { readId, status: 'finished', finishedAt: at, lastSessionAt: null }
}

test('a book finished in January counts in January, its December pages in December', () => {
  const sessions = [session('2025-12-20', 100), session('2026-01-05', 40)]
  const reads = [finished('r1', JAN_2026)]

  const y2025 = yearSummary(sessions, reads, 2025)
  const y2026 = yearSummary(sessions, reads, 2026)

  assert.equal(y2025.pages, 100)
  assert.equal(y2025.books, 0, 'the book was not finished in 2025')
  assert.equal(y2026.pages, 40)
  assert.equal(y2026.books, 1, 'a book counts in the year it was FINISHED')
})

test('pages and hours are separate fields, and nothing adds them', () => {
  const sessions = [session('2026-01-05', 30, 90)]
  const summary = yearSummary(sessions, [], 2026)
  assert.equal(summary.pages, 30)
  assert.equal(summary.minutes, 90)
  assert.equal(summary.hours, 1.5)
  // There is deliberately no `total`. If one is ever added, this is the test that should
  // stop it: an audiobook's hours must never be able to reach a page count.
  assert.equal('total' in summary, false)
})

test('an unusable session is surfaced, never used to shrink the total', () => {
  const broken: ProgressSession = {
    format: 'pages',
    fromPosition: 90,
    toPosition: 10, // backwards
    durationSeconds: null,
    occurredAt: Date.parse('2026-02-02T10:00:00'),
    localDay: '2026-02-02' as LocalDay,
  }
  const summary = yearSummary([session('2026-02-01', 20), broken], [], 2026)
  assert.equal(summary.pages, 20)
  assert.equal(summary.unusable, 1, 'the reader has to be able to find and fix it')
})

// ─── the year switcher ───────────────────────────────────────────────────────

test('the current year is always offered, even with nothing in it', () => {
  assert.deepEqual(yearsToOffer([], [], 2026), [2026])
})

test('years come from BOTH sessions and finishes, newest first', () => {
  const years = yearsToOffer([session('2024-03-01', 10)], [finished('r1', DEC_2025)], 2026)
  // 2025 has a finish and no sessions; 2024 has sessions and no finish. Taking only one
  // source would make the switcher disagree with the numbers under it.
  assert.deepEqual(years, [2026, 2025, 2024])
})

test('a finished read with no date at all belongs to no year', () => {
  // A book added as "I already finished it" with no date. Putting it in the current year
  // would be the app recording a number on the reader's behalf that it does not know.
  assert.deepEqual(yearsToOffer([], [finished('r1', null)], 2026), [2026])
  assert.equal(yearSummary([], [finished('r1', null)], 2026).books, 0)
})

test('a finished read falls back to its last session for its year', () => {
  const read: FinishedRead = {
    readId: 'r1',
    status: 'finished',
    finishedAt: null,
    lastSessionAt: DEC_2025,
  }
  assert.deepEqual(yearsToOffer([], [read], 2026), [2026, 2025])
  assert.equal(yearSummary([], [read], 2025).books, 1)
})

test('a read that is not finished counts nowhere', () => {
  const reading: FinishedRead = {
    readId: 'r1',
    status: 'reading',
    finishedAt: JAN_2026,
    lastSessionAt: null,
  }
  assert.equal(yearSummary([], [reading], 2026).books, 0)
})

test('an empty year is recognised, and a year with only a finish is not empty', () => {
  assert.equal(isEmptyYear(yearSummary([], [], 2026)), true)
  assert.equal(isEmptyYear(yearSummary([], [finished('r1', JAN_2026)], 2026)), false)
  assert.equal(isEmptyYear(yearSummary([session('2026-01-05', 5)], [], 2026)), false)
})
