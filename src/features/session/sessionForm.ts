/**
 * src/features/session/sessionForm.ts
 *
 * WHAT THE SESSION LOGGER ALLOWS, SAYS AND WRITES. Pure, so every rule is asserted under
 * `node --test` rather than tried once on a phone.
 *
 * The logger is the most important screen in the app (04-SCREENS, Journey E), and each
 * rule here is one a competitor gets wrong:
 *
 *   - **Positions are boundaries.** "Was on page 184, now on page 212" is 28 pages. The
 *     labels come from `session` in lib/strings.ts and never say "from" and "to".
 *   - **The date is always editable**, before saving and after, and a session may be for any
 *     day that has happened. Only the future is refused: a session dated tomorrow would count
 *     towards a streak day that has not arrived.
 *   - **A page count beyond the book's length never blocks a save.** The book's page count
 *     is usually what is wrong (domain/progress.ts, `exceedsKnownLength`). The form says so.
 *   - **Pages already counted by another session are pointed out, not refused.** Totals are
 *     sums of spans, so an overlapping backfill counts those pages twice. The reader may mean
 *     it (a re-read chapter), and cannot find the double count later unless told now.
 */

import type { SessionFormat } from '@/db/schema'
import type { RowFor } from '@/db/write'
import { formatWhen, type UnixMs } from '@/lib/dates'

/**
 * How far past "now" a session may be dated, for the clock drifting between opening the
 * logger and picking a time. A minute, not more: anything later is a future session.
 */
export const FUTURE_SLACK_MS = 60_000

/** Longest position a field accepts, in digits. A 99,999-page book does not exist. */
export const POSITION_MAX_DIGITS = 5

/** The form as typed. Positions are text, because "" and "12a" are states the form must show. */
export interface SessionForm {
  readonly format: SessionFormat
  readonly from: string
  readonly to: string
  readonly occurredAt: UnixMs
}

/** Where the reader already is in the current read, per format. Null when nothing says. */
export interface Positions {
  readonly pages: number | null
  readonly minutes: number | null
}

export interface FormBook {
  readonly pageCount: number | null
  readonly totalMinutes: number | null
}

/** Another live session of the same read, for the overlap hint. */
export interface OtherSession {
  readonly id: string
  readonly format: SessionFormat
  readonly fromPosition: number | null
  readonly toPosition: number | null
  readonly occurredAt: UnixMs
}

/** The session being edited, as stored. */
export interface StoredSession {
  readonly id: string
  readonly format: SessionFormat
  readonly fromPosition: number | null
  readonly toPosition: number | null
  readonly occurredAt: UnixMs
  readonly durationSeconds: number | null
}

export type Parsed = number | null | 'invalid'

/** "" is null, "212" is 212, and anything else is 'invalid' rather than a guess. */
export function parseWhole(text: string): Parsed {
  const t = text.trim()
  if (t === '') return null
  if (!/^\d+$/.test(t) || t.length > POSITION_MAX_DIGITS) return 'invalid'
  return Number(t)
}

/**
 * The format a new session starts in: the format of this read's latest session, so an
 * audiobook reader is not switched back to pages every time, then the book's own shape.
 */
export function defaultFormat(latest: SessionFormat | null, audiobook: boolean): SessionFormat {
  return latest ?? (audiobook ? 'minutes' : 'pages')
}

function positionFor(positions: Positions, format: SessionFormat): number | null {
  return format === 'pages' ? positions.pages : positions.minutes
}

/** A new session: from where the reader is, to nothing yet, now. */
export function newForm(format: SessionFormat, positions: Positions, now: UnixMs): SessionForm {
  return {
    format,
    from: String(positionFor(positions, format) ?? 0),
    to: '',
    occurredAt: now,
  }
}

export function formFromSession(s: StoredSession): SessionForm {
  return {
    format: s.format,
    from: s.fromPosition === null ? '' : String(s.fromPosition),
    to: s.toPosition === null ? '' : String(s.toPosition),
    occurredAt: s.occurredAt,
  }
}

/**
 * Switch pages ↔ minutes. A NEW session restarts from where the reader is in that format,
 * because page 212 is not minute 212. An EXISTING session keeps its numbers: the reader is
 * correcting a session logged in the wrong unit, and wiping what they typed would lose it.
 */
export function switchFormat(
  form: SessionForm,
  format: SessionFormat,
  positions: Positions | null,
): SessionForm {
  if (format === form.format) return form
  if (positions === null) return { ...form, format }
  return { ...form, format, from: String(positionFor(positions, format) ?? 0), to: '' }
}

/** "+10": from the end already typed, or from where the session started. */
export function quickAdd(form: SessionForm, n: number): SessionForm {
  const to = parseWhole(form.to)
  const from = parseWhole(form.from)
  const base = typeof to === 'number' ? to : typeof from === 'number' ? from : 0
  return { ...form, to: String(base + n) }
}

/** The last page (or minute) of the book, for the Finished chip, or null when unknown. */
export function bookEnd(format: SessionFormat, book: FormBook): number | null {
  const end = format === 'pages' ? book.pageCount : book.totalMinutes
  return end !== null && end > 0 ? end : null
}

/** Pages (or minutes) this session covers, or null until both ends make sense. */
export function sessionSpan(form: SessionForm): number | null {
  const from = parseWhole(form.from)
  const to = parseWhole(form.to)
  if (typeof from !== 'number' || typeof to !== 'number' || to <= from) return null
  return to - from
}

export interface FormCheck {
  readonly errors: {
    readonly from?: string
    readonly to?: string
    readonly when?: string
  }
  /** Worth knowing, never a reason to refuse. */
  readonly hints: readonly string[]
  readonly canSave: boolean
}

export interface CheckContext {
  readonly now: UnixMs
  readonly book: FormBook
  /** Other live sessions of the same read. The edited session itself may be included. */
  readonly others: readonly OtherSession[]
  /** The id being edited, or null for a new session. */
  readonly editingId: string | null
  /**
   * True when saving with no positions at all is legitimate: editing a session that has a
   * duration (a recovered or timed one), whose time already counts.
   */
  readonly allowNoPositions: boolean
  /** Today, injectable for tests. */
  readonly today?: string
}

function unitWord(format: SessionFormat): string {
  return format === 'pages' ? 'page' : 'minute'
}

export function checkForm(form: SessionForm, ctx: CheckContext): FormCheck {
  const errors: { from?: string; to?: string; when?: string } = {}
  const hints: string[] = []
  const from = parseWhole(form.from)
  const to = parseWhole(form.to)
  const unit = unitWord(form.format)

  if (from === 'invalid') errors.from = 'Whole numbers only'
  if (to === 'invalid') errors.to = 'Whole numbers only'
  if (typeof from === 'number' && typeof to === 'number' && to <= from) {
    errors.to = `Must be after ${unit} ${from}`
  }
  if (form.occurredAt > ctx.now + FUTURE_SLACK_MS) {
    errors.when = 'That has not happened yet. Pick a time up to now.'
  }

  // Saveable positions: both ends, forwards. Or none at all, only for a session whose
  // duration already counts. A start with no end is not a session anyone can count
  // (domain/stats.ts, `contribution`), but it gets no error text: an empty end is where
  // every new session starts, and Save simply waits for it.
  const bothEmpty = from === null && to === null
  const complete =
    typeof to === 'number' && typeof from === 'number'
      ? to > from
      : bothEmpty && ctx.allowNoPositions
  if (from === null && typeof to === 'number') errors.from = `Which ${unit} were you on?`

  const end = bookEnd(form.format, ctx.book)
  if (typeof to === 'number' && end !== null && to > end) {
    hints.push(
      form.format === 'pages'
        ? `The book is ${end} pages long. Saving is fine; its page count may be wrong.`
        : `The book is ${end} minutes long. Saving is fine; its length may be wrong.`,
    )
  }

  const span = sessionSpan(form)
  if (span !== null && typeof from === 'number' && typeof to === 'number') {
    const clash = ctx.others.find(
      (o) =>
        o.id !== ctx.editingId &&
        o.format === form.format &&
        o.fromPosition !== null &&
        o.toPosition !== null &&
        o.toPosition > o.fromPosition &&
        from < o.toPosition &&
        to > o.fromPosition,
    )
    if (clash && clash.fromPosition !== null && clash.toPosition !== null) {
      const plural = form.format === 'pages' ? 'Pages' : 'Minutes'
      hints.push(
        `${plural} ${clash.fromPosition} → ${clash.toPosition} are already in a session on ` +
          `${formatWhen(clash.occurredAt, ctx.today)}. Saving counts the overlap twice.`,
      )
    }
  }

  const canSave = complete && Object.keys(errors).length === 0
  return { errors, hints, canSave }
}

/** The row a new session writes. `local_day` is derived by the write path, never here. */
export function newSessionRow(
  form: SessionForm,
  ids: { readonly id: string; readonly readId: string },
): RowFor<'sessions'> {
  const from = parseWhole(form.from)
  const to = parseWhole(form.to)
  return {
    id: ids.id,
    readId: ids.readId,
    occurredAt: form.occurredAt,
    format: form.format,
    fromPosition: typeof from === 'number' ? from : null,
    toPosition: typeof to === 'number' ? to : null,
    durationSeconds: null,
    isTimed: 0,
    note: null,
  }
}

export interface SessionPatch {
  occurredAt?: UnixMs
  format?: SessionFormat
  fromPosition?: number | null
  toPosition?: number | null
}

/**
 * Only what changed. An edit that changes nothing writes nothing and queues nothing, and a
 * date left alone never has its `local_day` recomputed in a new timezone (03-DATA-MODEL).
 */
export function sessionPatch(original: StoredSession, form: SessionForm): SessionPatch {
  const patch: SessionPatch = {}
  const from = parseWhole(form.from)
  const to = parseWhole(form.to)
  const nextFrom = typeof from === 'number' ? from : null
  const nextTo = typeof to === 'number' ? to : null
  if (form.occurredAt !== original.occurredAt) patch.occurredAt = form.occurredAt
  if (form.format !== original.format) patch.format = form.format
  if (nextFrom !== original.fromPosition) patch.fromPosition = nextFrom
  if (nextTo !== original.toPosition) patch.toPosition = nextTo
  return patch
}

export function isDirty(form: SessionForm, baseline: SessionForm): boolean {
  return (
    form.format !== baseline.format ||
    form.from.trim() !== baseline.from.trim() ||
    form.to.trim() !== baseline.to.trim() ||
    form.occurredAt !== baseline.occurredAt
  )
}
