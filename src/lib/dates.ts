/**
 * src/lib/dates.ts
 *
 * ALL date handling lives here. Nowhere else in the app imports date-fns.
 *
 * The rules, from docs/06-CONVENTIONS.md:
 *   - Store UTC unix milliseconds. Always.
 *   - Format at render time, in the device timezone.
 *   - Group by `sessions.local_day`, never by `date(occurred_at)`.
 *
 * This is the most bug-prone area in the app and the one the product thesis rests on.
 */

import {
  addDays as fnsAddDays,
  differenceInCalendarDays,
  format as fnsFormat,
  isValid,
  parse as fnsParse,
  set as fnsSet,
  startOfDay,
} from 'date-fns'

/** UTC unix milliseconds. The only time representation stored anywhere. */
export type UnixMs = number

/** A calendar day in the device timezone, `YYYY-MM-DD`. Never a timestamp. */
export type LocalDay = string

const LOCAL_DAY_FORMAT = 'yyyy-MM-dd'
const LOCAL_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function now(): UnixMs {
  return Date.now()
}

/**
 * The single place a `local_day` is ever produced.
 *
 * `Date` renders in the device's current timezone, which is exactly what we want: the
 * calendar day as the reader experienced it. A session at 23:00 on the 31st in IST is
 * 17:30 UTC on the 31st and yields "the 31st"; one at 04:00 on the 1st in IST is 22:30
 * UTC on the previous day and still correctly yields "the 1st".
 */
export function toLocalDay(ts: UnixMs): LocalDay {
  return fnsFormat(new Date(ts), LOCAL_DAY_FORMAT)
}

export function todayLocalDay(): LocalDay {
  return toLocalDay(now())
}

export function isLocalDay(value: string): value is LocalDay {
  if (!LOCAL_DAY_PATTERN.test(value)) return false
  return isValid(fnsParse(value, LOCAL_DAY_FORMAT, new Date()))
}

/**
 * Midnight local time on a given calendar day, as UTC ms. Use for range queries that
 * must align to local days rather than for storage.
 */
export function startOfLocalDay(day: LocalDay): UnixMs {
  return fnsParse(day, LOCAL_DAY_FORMAT, startOfDay(new Date())).getTime()
}

/** The calendar year of a local day. Used by yearly aggregates. */
export function yearOfLocalDay(day: LocalDay): number {
  return Number(day.slice(0, 4))
}

/**
 * The calendar year of a UTC timestamp, in the device timezone.
 *
 * `reads.finishedAt` is a bare timestamp rather than a bucket key, so it gets no stored
 * column. It still must not be bucketed in UTC, or a New Year's Eve finish lands in the
 * wrong year. This is the function that prevents that.
 */
export function localYearOf(ts: UnixMs): number {
  return new Date(ts).getFullYear()
}

/** Whole calendar days between two local days. Negative if `b` is before `a`. */
export function daysBetween(a: LocalDay, b: LocalDay): number {
  return differenceInCalendarDays(
    fnsParse(b, LOCAL_DAY_FORMAT, new Date()),
    fnsParse(a, LOCAL_DAY_FORMAT, new Date()),
  )
}

/**
 * The local day `n` days after `day`. Negative `n` goes backwards.
 *
 * Uses date-fns rather than `setDate`, which is not DST-safe: in zones where the clock
 * jumps at midnight, a manually incremented Date can land on the wrong calendar day.
 * The streak calculation walks backwards with this function, so an off-by-one here
 * silently breaks streaks twice a year.
 */
export function addDays(day: LocalDay, n: number): LocalDay {
  return fnsFormat(fnsAddDays(fnsParse(day, LOCAL_DAY_FORMAT, new Date()), n), LOCAL_DAY_FORMAT)
}

// ─── EDITING AN INSTANT ──────────────────────────────────────────────────────
// A session's date and time are picked separately (Android's pickers are one or the other),
// and each pick must leave the other half alone, in LOCAL wall-clock terms. Built on
// date-fns `set`, which keeps the wall clock across a DST change rather than adding hours.

/**
 * `ts` moved to another calendar day, keeping its local time of day. `month` is 1 to 12.
 * Picking "last Tuesday" for a session logged at 9:40 pm gives last Tuesday, 9:40 pm.
 */
export function withLocalDate(ts: UnixMs, year: number, month: number, day: number): UnixMs {
  return fnsSet(new Date(ts), { year, month: month - 1, date: day }).getTime()
}

/** `ts` at another local time on the same calendar day, to the minute. */
export function withLocalTime(ts: UnixMs, hours: number, minutes: number): UnixMs {
  return fnsSet(new Date(ts), { hours, minutes, seconds: 0, milliseconds: 0 }).getTime()
}

/**
 * The calendar day of `picked`, with the time of day of `ts`. For a date picker, which hands
 * back an instant whose time of day means nothing.
 */
export function takeLocalDate(ts: UnixMs, picked: UnixMs): UnixMs {
  const d = new Date(picked)
  return withLocalDate(ts, d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** The time of day of `picked`, on the calendar day of `ts`. For a time picker. */
export function takeLocalTime(ts: UnixMs, picked: UnixMs): UnixMs {
  const d = new Date(picked)
  return withLocalTime(ts, d.getHours(), d.getMinutes())
}

// ─── RENDERING ───────────────────────────────────────────────────────────────
// Everything below is display only. None of it is ever stored.

/** "3 Sep 2026" */
export function formatDate(ts: UnixMs): string {
  return fnsFormat(new Date(ts), 'd MMM yyyy')
}

/** "3 Sep" — for the current year, where the year is noise. */
export function formatDateShort(ts: UnixMs): string {
  return fnsFormat(new Date(ts), 'd MMM')
}

/** "9:40 pm" */
export function formatTime(ts: UnixMs): string {
  return fnsFormat(new Date(ts), 'h:mm a').toLowerCase()
}

/** "Today", "Yesterday", or a short date. Used wherever a session date is shown. */
export function formatRelativeDay(ts: UnixMs): string {
  const delta = daysBetween(toLocalDay(ts), todayLocalDay())
  if (delta === 0) return 'Today'
  if (delta === 1) return 'Yesterday'
  return formatDateShort(ts)
}

/**
 * When a session happened, as the logger and Session complete show it:
 * "Today, 9:40 pm", "Yesterday, 9:40 pm", "Tue 8 Sep, 9:40 pm", and the year only when it
 * is not this one. The weekday is there because a backdated session is remembered by it:
 * "I read on Tuesday", not "I read on the 8th".
 */
export function formatWhen(ts: UnixMs, today: LocalDay = todayLocalDay()): string {
  const delta = daysBetween(toLocalDay(ts), today)
  const time = formatTime(ts)
  if (delta === 0) return `Today, ${time}`
  if (delta === 1) return `Yesterday, ${time}`
  const sameYear = yearOfLocalDay(toLocalDay(ts)) === yearOfLocalDay(today)
  return `${fnsFormat(new Date(ts), sameYear ? 'EEE d MMM' : 'EEE d MMM yyyy')}, ${time}`
}

/** "T" for a Tuesday, from a local day. The pace chart's bar labels. */
export function weekdayInitial(day: LocalDay): string {
  return fnsFormat(fnsParse(day, LOCAL_DAY_FORMAT, new Date()), 'EEEEE')
}

/** "Tue 8 Sep", from a local day. A pace bar's accessibility label. */
export function formatLocalDay(day: LocalDay): string {
  return fnsFormat(fnsParse(day, LOCAL_DAY_FORMAT, new Date()), 'EEE d MMM')
}

/** "1h 12m", "48m", "30s". For session durations, never for page counts. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}
