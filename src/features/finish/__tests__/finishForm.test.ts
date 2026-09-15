/**
 * The finish flow's rules. Timezone-sensitive (the date checks and the year count), so it is in
 * `npm run test:tz`.
 */

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  checkFinish,
  finishDateLabel,
  finishPatch,
  finishSummary,
  formFromRead,
  isFinishDirty,
  isValidRating,
  ratingFromTap,
  stepRating,
  withFinishDate,
  type FinishRead,
} from '../finishForm'
import type { FinishedRead } from '@/domain/finishes'

function at(y: number, m: number, d: number, hh = 12, mm = 0): number {
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime()
}

const NOW = at(2026, 9, 14, 21, 0)

const reading: FinishRead = {
  readId: 'read-2',
  status: 'reading',
  rating: null,
  review: null,
  startedAt: null,
  finishedAt: null,
  firstSessionAt: at(2026, 8, 23, 20),
  lastSessionAt: at(2026, 9, 13, 22),
  pagesRead: 502,
  minutesRead: 0,
}

describe('the date the form starts with', () => {
  test('finishing now: today, and it is the reader’s to save', () => {
    const form = formFromRead(reading, NOW)
    assert.equal(form.finishedAt, NOW)
    assert.equal(form.dateSource, 'reader')
  })

  test('a Want to read book with no sessions: no date, never today', () => {
    const want = {
      ...reading,
      status: 'want' as const,
      firstSessionAt: null,
      lastSessionAt: null,
    }
    const form = formFromRead(want, NOW)
    assert.equal(form.finishedAt, null)
    assert.equal(form.dateSource, 'unknown')
    // Still moved to Finished when saved, with no date written.
    assert.deepEqual(finishPatch(want, form), { status: 'finished' })
  })

  test('a Reading book with no sessions yet, or a DNF book with some: today', () => {
    const fresh = { ...reading, firstSessionAt: null, lastSessionAt: null }
    assert.equal(formFromRead(fresh, NOW).finishedAt, NOW)
    assert.equal(formFromRead({ ...reading, status: 'dnf' }, NOW).finishedAt, NOW)
  })

  test('an already finished read with a stored date: that date', () => {
    const form = formFromRead(
      { ...reading, status: 'finished', finishedAt: at(2026, 9, 1) },
      NOW,
    )
    assert.equal(form.finishedAt, at(2026, 9, 1))
    assert.equal(form.dateSource, 'reader')
  })

  test('an already finished read without one: its last session, marked derived', () => {
    const form = formFromRead({ ...reading, status: 'finished' }, NOW)
    assert.equal(form.finishedAt, reading.lastSessionAt)
    assert.equal(form.dateSource, 'derived')
  })

  test('finished with no sessions and no date: no date at all, never today', () => {
    const form = formFromRead(
      { ...reading, status: 'finished', firstSessionAt: null, lastSessionAt: null },
      NOW,
    )
    assert.equal(form.finishedAt, null)
    assert.equal(form.dateSource, 'unknown')
  })
})

describe('what saving writes', () => {
  test('finishing moves the read to Finished and stores the date and rating', () => {
    const form = { ...formFromRead(reading, NOW), rating: 4.5, review: '  Stayed with me.  ' }
    assert.deepEqual(finishPatch(reading, form), {
      status: 'finished',
      rating: 4.5,
      review: 'Stayed with me.',
      finishedAt: NOW,
    })
  })

  test('the move to Finished is written even when nothing else is filled in', () => {
    assert.deepEqual(finishPatch(reading, formFromRead(reading, NOW)), {
      status: 'finished',
      finishedAt: NOW,
    })
  })

  test('a derived date left alone is NOT written into finished_at', () => {
    const finished = { ...reading, status: 'finished' as const }
    const form = { ...formFromRead(finished, NOW), rating: 3 }
    assert.deepEqual(finishPatch(finished, form), { rating: 3 })
  })

  test('a derived date the reader changed is written', () => {
    const finished = { ...reading, status: 'finished' as const }
    const form = withFinishDate(formFromRead(finished, NOW), at(2026, 9, 14))
    assert.deepEqual(finishPatch(finished, form), { finishedAt: at(2026, 9, 14) })
  })

  test('an untouched finished read writes nothing, and a cleared note is null', () => {
    const finished = {
      ...reading,
      status: 'finished' as const,
      rating: 4,
      review: 'Good',
      finishedAt: at(2026, 9, 1),
    }
    const form = formFromRead(finished, NOW)
    assert.deepEqual(finishPatch(finished, form), {})
    assert.deepEqual(finishPatch(finished, { ...form, review: '   ' }), { review: null })
    assert.equal(isFinishDirty(form, form), false)
    assert.equal(isFinishDirty({ ...form, rating: null }, form), true)
  })
})

describe('the date checks', () => {
  const form = formFromRead(reading, NOW)

  test('today and the day of the last session are allowed', () => {
    assert.equal(checkFinish(form, reading, NOW).canSave, true)
    assert.equal(
      checkFinish(withFinishDate(form, at(2026, 9, 13, 8)), reading, NOW).canSave,
      true,
    )
  })

  test('a day after today is refused', () => {
    const check = checkFinish(withFinishDate(form, at(2026, 9, 15)), reading, NOW)
    assert.equal(check.canSave, false)
    assert.match(check.errors.date ?? '', /after today/)
  })

  test('a day before the last session is refused, with that session’s date', () => {
    const check = checkFinish(withFinishDate(form, at(2026, 9, 12)), reading, NOW)
    assert.equal(check.canSave, false)
    assert.match(check.errors.date ?? '', /13 Sep 2026/)
  })

  test('a day before a stored start is refused', () => {
    const started = { ...reading, lastSessionAt: null, startedAt: at(2026, 9, 10) }
    const check = checkFinish(withFinishDate(form, at(2026, 9, 9)), started, NOW)
    assert.match(check.errors.date ?? '', /started on 10 Sep 2026/)
  })

  test('no date is allowed for a read that never had one', () => {
    const undated = { ...reading, status: 'finished' as const, lastSessionAt: null }
    assert.equal(checkFinish(formFromRead(undated, NOW), undated, NOW).canSave, true)
  })
})

describe('the rating', () => {
  test('the left half of the third star is 2.5, the right half 3', () => {
    assert.equal(ratingFromTap(2, true, null), 2.5)
    assert.equal(ratingFromTap(2, false, null), 3)
  })

  test('tapping the rating already shown clears it', () => {
    assert.equal(ratingFromTap(4, true, 4.5), null)
    assert.equal(ratingFromTap(4, false, 4.5), 5)
  })

  test('TalkBack steps in halves, down to no rating and up to 5', () => {
    assert.equal(stepRating(null, 1), 0.5)
    assert.equal(stepRating(0.5, -1), null)
    assert.equal(stepRating(5, 1), 5)
    assert.equal(stepRating(3, -1), 2.5)
  })

  test('only half steps between 0.5 and 5', () => {
    assert.equal(isValidRating(null), true)
    assert.equal(isValidRating(4.5), true)
    assert.equal(isValidRating(0), false)
    assert.equal(isValidRating(4.25), false)
    assert.equal(isValidRating(5.5), false)
  })
})

describe('what the screen says', () => {
  const others: FinishedRead[] = Array.from({ length: 30 }, (_, i) => ({
    readId: `other-${i}`,
    status: 'finished',
    finishedAt: at(2026, 1, 1 + i),
    lastSessionAt: null,
  }))

  test('the artboard’s line: pages, days, and the ordinal this year', () => {
    const form = formFromRead(reading, NOW)
    assert.equal(
      finishSummary({ read: reading, form, finished: others, now: NOW }),
      '502 pages over 23 days · your 31st book this year',
    )
  })

  test('moving the date to last year moves the count to last year, before saving', () => {
    const lastYear = at(2025, 12, 31, 23)
    const early = {
      ...reading,
      firstSessionAt: at(2025, 12, 1),
      lastSessionAt: at(2025, 12, 30),
    }
    const form = withFinishDate(formFromRead(early, NOW), lastYear)
    assert.equal(
      finishSummary({ read: early, form, finished: others, now: NOW }),
      '502 pages over 31 days · your 1st book of 2025',
    )
  })

  test('this read’s own earlier finish is not counted twice', () => {
    const itself: FinishedRead = {
      readId: 'read-2',
      status: 'finished',
      finishedAt: NOW,
      lastSessionAt: null,
    }
    const form = formFromRead(reading, NOW)
    assert.match(
      finishSummary({ read: reading, form, finished: [itself], now: NOW }) ?? '',
      /1st book/,
    )
  })

  test('time, not pages, for a listened book; a day when it took one', () => {
    const audio = {
      ...reading,
      pagesRead: 0,
      minutesRead: 680,
      firstSessionAt: NOW,
      lastSessionAt: NOW,
    }
    assert.equal(
      finishSummary({ read: audio, form: formFromRead(audio, NOW), finished: [], now: NOW }),
      '11h 20m of reading in a day · your 1st book this year',
    )
  })

  test('no sessions and no date says nothing rather than something invented', () => {
    const bare = {
      ...reading,
      status: 'finished' as const,
      pagesRead: 0,
      firstSessionAt: null,
      lastSessionAt: null,
    }
    assert.equal(
      finishSummary({ read: bare, form: formFromRead(bare, NOW), finished: [], now: NOW }),
      null,
    )
  })
})

test('the date row says today, yesterday, a full date, or asks', () => {
  assert.equal(finishDateLabel(at(2026, 9, 14, 0, 5), NOW), 'Finished today')
  assert.equal(finishDateLabel(at(2026, 9, 13, 23, 50), NOW), 'Finished yesterday')
  assert.equal(finishDateLabel(at(2025, 12, 31, 23), NOW), 'Finished 31 Dec 2025')
  assert.equal(finishDateLabel(null, NOW), 'When did you finish?')
})
