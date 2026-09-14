/**
 * src/features/session/sessionComplete.ts
 *
 * WHAT SESSION COMPLETE SAYS, from `SessionComplete.dc.html`. Pure, so the numbers are
 * asserted rather than eyeballed.
 *
 * The screen is editable (04-SCREENS, Journey E): the end page has a stepper and the date can
 * be changed. Every number here is computed from the session AS IT IS BEING EDITED, not as it
 * was saved, so moving the date to last Tuesday moves the streak with it before Done is
 * tapped, and a streak never claims a day the reader has just taken away.
 */

import {
  secondsLeft,
  currentPosition,
  percentComplete,
  type ProgressSession,
} from '@/domain/progress'
import { currentStreak } from '@/domain/streaks'
import { formatDuration, toLocalDay, type LocalDay } from '@/lib/dates'

import { parseWhole, sessionSpan, type FormBook, type SessionForm } from './sessionForm'

/** The session being shown, as stored: what the form cannot change. */
export interface CompleteSession {
  readonly id: string
  readonly durationSeconds: number | null
}

/** Another session of the same read, with its id. */
export interface ReadSessionFact extends ProgressSession {
  readonly id: string
}

/** The stepper: one page (or minute) at a time, never back to or past the start. */
export function stepEnd(form: SessionForm, delta: number): SessionForm {
  const from = parseWhole(form.from)
  const to = parseWhole(form.to)
  const start = typeof from === 'number' ? from : 0
  const current = typeof to === 'number' ? to : start
  return { ...form, to: String(Math.max(start + 1, current + delta)) }
}

export type TimeLeft =
  | { readonly kind: 'time'; readonly seconds: number }
  | { readonly kind: 'pages'; readonly count: number }

export interface CompleteSummary {
  /** The big number and its unit: "41m", or "28" with "pages". */
  readonly headline: string
  readonly headlineUnit: string | null
  /** "28 pages, 184 → 212", or "Page 184 → 212". Null with nothing to add. */
  readonly detail: string | null
  readonly streak: number
  /** 0 to 1, or null when the book's length is unknown. */
  readonly fraction: number | null
  readonly left: TimeLeft | null
}

export function completeSummary(input: {
  readonly form: SessionForm
  readonly session: CompleteSession
  readonly readSessions: readonly ReadSessionFact[]
  readonly book: FormBook
  /** Every reading day except this session's: `getReadingDays(sessionId)`. */
  readonly otherDays: readonly LocalDay[]
  readonly today: LocalDay
}): CompleteSummary {
  const { form, session, book } = input
  const span = sessionSpan(form)
  const from = parseWhole(form.from)
  const to = parseWhole(form.to)
  const unit = form.format === 'pages' ? 'pages' : 'minutes'
  const duration =
    session.durationSeconds !== null && session.durationSeconds > 0
      ? session.durationSeconds
      : null
  const range = typeof from === 'number' && typeof to === 'number' ? `${from} → ${to}` : null

  let headline: string
  let headlineUnit: string | null
  let detail: string | null
  if (duration !== null) {
    headline = formatDuration(duration)
    headlineUnit = null
    detail = span !== null && range !== null ? `${span} ${unit}, ${range}` : null
  } else {
    headline = String(span ?? 0)
    headlineUnit = unit
    detail = range === null ? null : `${form.format === 'pages' ? 'Page' : 'Minute'} ${range}`
  }

  // The read as it will be once saved: this session with the form's values.
  const edited: ReadSessionFact = {
    id: session.id,
    format: form.format,
    fromPosition: typeof from === 'number' ? from : null,
    toPosition: typeof to === 'number' ? to : null,
    durationSeconds: session.durationSeconds,
    occurredAt: form.occurredAt,
    localDay: toLocalDay(form.occurredAt),
  }
  const merged = [...input.readSessions.filter((s) => s.id !== session.id), edited]
  const position = currentPosition(merged, form.format)
  const total = form.format === 'pages' ? book.pageCount : book.totalMinutes
  const fraction = position === null ? null : percentComplete(position, total)

  const seconds = secondsLeft(merged, form.format, position, total)
  const left: TimeLeft | null =
    seconds !== null
      ? { kind: 'time', seconds }
      : form.format === 'pages' && position !== null && total !== null && total > position
        ? { kind: 'pages', count: total - position }
        : null

  const streak = currentStreak([...input.otherDays, edited.localDay], input.today)
  return { headline, headlineUnit, detail, streak, fraction, left }
}
