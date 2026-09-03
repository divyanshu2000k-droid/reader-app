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
