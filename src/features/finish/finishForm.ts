/**
 * src/features/finish/finishForm.ts
 *
 * WHAT THE FINISH FLOW ALLOWS, SAYS AND WRITES. Pure, from `FinishBook.dc.html` and 04-SCREENS,
 * Journey F: a half-star rating, an optional private note, and a finish date that defaults to
 * today and can be changed.
 *
 * ─── THE FINISH DATE, AND THE OVERRIDE RULE ──────────────────────────────────
 *
 * `reads.finished_at` is a nullable override: null means "derive it from the last session", and
 * a computed value is never written into it (03-DATA-MODEL). This form keeps both halves true:
 *
 * - **Finishing a book now**, the date starts at today and the reader saves it with "Add to
 *   Finished". That is the reader's answer to "when did you finish?", so it is stored. It is not
 *   a cached calculation: nothing about the sessions produced it.
 * - **Moving a Want to read book with no sessions to Finished** is almost always "I read this
 *   before I used the app", not "I finished it today". Its date starts empty and is asked for,
 *   like "I already finished it": today would put a book read years ago into this year's count.
 * - **Opening a read that is already finished**, with no stored date, shows the date derived
 *   from its last session. Saving without touching it stores nothing, so a session added later
 *   still moves it.
 * - **A finished read with no sessions and no date** (added as "I already finished it") shows no
 *   date and asks for one. Leaving it empty is allowed: it counts as finished, in no year.
 *
 * A date after today is refused, and so is one before the read's last session or its stored
 * start: a book is not finished before it was last read.
 */

import type { ReadStatus } from '@/db/schema'
import type { PatchFor } from '@/db/write'
import { finishedInYear, ordinal, type FinishedRead } from '@/domain/finishes'
import {
  daysBetween,
  formatDate,
  formatDuration,
  localYearOf,
  toLocalDay,
  type UnixMs,
} from '@/lib/dates'

/** Long enough for a paragraph or two of thoughts, short enough to never be a novel. */
export const REVIEW_MAX_LENGTH = 5000

/** Where the date on screen came from, which decides whether saving writes it. */
export type DateSource = 'reader' | 'derived' | 'unknown'

export interface FinishForm {
  readonly rating: number | null
  readonly review: string
  readonly finishedAt: UnixMs | null
  readonly dateSource: DateSource
}

/** The read being finished, as the flow needs it. */
export interface FinishRead {
  readonly readId: string
  readonly status: ReadStatus
  readonly rating: number | null
  readonly review: string | null
  readonly startedAt: UnixMs | null
  readonly finishedAt: UnixMs | null
  readonly firstSessionAt: UnixMs | null
  readonly lastSessionAt: UnixMs | null
  readonly pagesRead: number
  readonly minutesRead: number
}

export function formFromRead(read: FinishRead, now: UnixMs): FinishForm {
  const base = { rating: read.rating, review: read.review ?? '' }
  if (read.status !== 'finished') {
    const readNow = read.status === 'reading' || read.lastSessionAt !== null
    return readNow
      ? { ...base, finishedAt: now, dateSource: 'reader' }
      : { ...base, finishedAt: null, dateSource: 'unknown' }
  }
  if (read.finishedAt !== null)
    return { ...base, finishedAt: read.finishedAt, dateSource: 'reader' }
  if (read.lastSessionAt !== null) {
    return { ...base, finishedAt: read.lastSessionAt, dateSource: 'derived' }
  }
  return { ...base, finishedAt: null, dateSource: 'unknown' }
}

/** The reader picked a date. From here on it is theirs, and saving stores it. */
export function withFinishDate(form: FinishForm, at: UnixMs): FinishForm {
  return { ...form, finishedAt: at, dateSource: 'reader' }
}

// ─── RATING ──────────────────────────────────────────────────────────────────

export function isValidRating(rating: number | null): boolean {
  if (rating === null) return true
  return rating >= 0.5 && rating <= 5 && Number.isInteger(rating * 2)
}

/**
 * A tap on the left or right half of star `index` (0 to 4). Tapping the rating already shown
 * clears it: a rating is optional, and there is no other way back to none.
 */
export function ratingFromTap(
  index: number,
  leftHalf: boolean,
  current: number | null,
): number | null {
  const next = index + (leftHalf ? 0.5 : 1)
  return next === current ? null : next
}

/** TalkBack's increment and decrement: half a star at a time, down to no rating. */
export function stepRating(current: number | null, direction: 1 | -1): number | null {
  const next = (current ?? 0) + direction * 0.5
  if (next < 0.5) return null
  return Math.min(5, next)
}

// ─── CHECKS ──────────────────────────────────────────────────────────────────

export interface FinishCheck {
  readonly errors: { readonly date?: string; readonly review?: string }
  readonly canSave: boolean
}

export function checkFinish(form: FinishForm, read: FinishRead, now: UnixMs): FinishCheck {
  const errors: { date?: string; review?: string } = {}

  if (form.finishedAt !== null && form.dateSource === 'reader') {
    const day = toLocalDay(form.finishedAt)
    if (day > toLocalDay(now)) {
      errors.date = 'That is after today. Pick the day you finished.'
    } else if (read.lastSessionAt !== null && day < toLocalDay(read.lastSessionAt)) {
      errors.date = `Your last session on this read was on ${formatDate(read.lastSessionAt)}. Pick that day or later.`
    } else if (read.startedAt !== null && day < toLocalDay(read.startedAt)) {
      errors.date = `This read started on ${formatDate(read.startedAt)}. Pick that day or later.`
    }
  }
  if (form.review.length > REVIEW_MAX_LENGTH) {
    errors.review = `Keep it under ${REVIEW_MAX_LENGTH} characters.`
  }

  const ratingOk = isValidRating(form.rating)
  return { errors, canSave: ratingOk && Object.keys(errors).length === 0 }
}

// ─── WRITING ─────────────────────────────────────────────────────────────────

/**
 * What saving writes: the move to Finished, and each field that changed. A derived date is
 * never written (see the header), and an untouched field is not rewritten.
 */
export function finishPatch(read: FinishRead, form: FinishForm): PatchFor<'reads'> {
  const patch: PatchFor<'reads'> = {}
  if (read.status !== 'finished') patch.status = 'finished'
  if (form.rating !== read.rating) patch.rating = form.rating
  const review = form.review.trim() === '' ? null : form.review.trim()
  if (review !== read.review) patch.review = review
  if (form.dateSource === 'reader' && form.finishedAt !== read.finishedAt) {
    patch.finishedAt = form.finishedAt
  }
  return patch
}

export function isFinishDirty(form: FinishForm, baseline: FinishForm): boolean {
  return (
    form.rating !== baseline.rating ||
    form.review.trim() !== baseline.review.trim() ||
    form.finishedAt !== baseline.finishedAt
  )
}

// ─── WHAT THE SCREEN SAYS ────────────────────────────────────────────────────

/**
 * "502 pages over 23 days · your 31st book this year", following the date on screen.
 *
 * Pages and time are never summed (01-PRODUCT): pages when any were logged, otherwise time.
 * The count leaves out this read and adds one, so moving the date to last December moves the
 * book into last year's count before anything is saved. Null when nothing is known.
 */
export function finishSummary(input: {
  readonly read: FinishRead
  readonly form: FinishForm
  readonly finished: readonly FinishedRead[]
  readonly now: UnixMs
}): string | null {
  const { read, form, finished, now } = input

  const amount =
    read.pagesRead > 0
      ? `${read.pagesRead} ${read.pagesRead === 1 ? 'page' : 'pages'}`
      : read.minutesRead > 0
        ? `${formatDuration(Math.round(read.minutesRead * 60))} of reading`
        : null

  const start = read.startedAt ?? read.firstSessionAt
  let span: string | null = null
  if (start !== null && form.finishedAt !== null) {
    const days = daysBetween(toLocalDay(start), toLocalDay(form.finishedAt)) + 1
    if (days >= 1) span = days === 1 ? 'in a day' : `over ${days} days`
  }

  let count: string | null = null
  if (form.finishedAt !== null) {
    const year = localYearOf(form.finishedAt)
    const n = finishedInYear(finished, year, read.readId) + 1
    count =
      year === localYearOf(now)
        ? `your ${ordinal(n)} book this year`
        : `your ${ordinal(n)} book of ${year}`
  }

  const reading =
    amount !== null ? [amount, span].filter(Boolean).join(' ') : span ? `Read ${span}` : null
  const parts = [reading, count].filter((p): p is string => p !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** "Finished today", "Finished yesterday", "Finished 3 Sep 2026", or the question when unknown. */
export function finishDateLabel(at: UnixMs | null, now: UnixMs): string {
  if (at === null) return 'When did you finish?'
  const delta = daysBetween(toLocalDay(at), toLocalDay(now))
  if (delta === 0) return 'Finished today'
  if (delta === 1) return 'Finished yesterday'
  return `Finished ${formatDate(at)}`
}
