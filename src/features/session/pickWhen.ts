/**
 * src/features/session/pickWhen.ts
 *
 * The date and time pickers, as promises. Android's own dialogs: accessible, localised, and
 * the ones the reader already knows (DECISIONS.md, 2026-09-13).
 *
 * Android shows a date OR a time, never both, so "When" is two dialogs in a row. Cancelling
 * the date changes nothing. Cancelling the time keeps the new date at the old time of day,
 * which is what the reader chose so far.
 *
 * No date after today can be picked. A time later than now today can, and the form refuses it
 * with a reason (sessionForm.ts): the picker has no maximum time.
 */

import { takeLocalDate, takeLocalTime, type UnixMs } from '@/lib/dates'
import { openPicker as open } from '@/ui/datePicker'

/** Date then time. Resolves to the new instant, or null if the reader cancelled the date. */
export async function pickWhen(current: UnixMs, now: UnixMs): Promise<UnixMs | null> {
  const day = await open('date', current, now)
  if (day === null) return null
  const onDay = takeLocalDate(current, day)
  const time = await open('time', onDay, now)
  return time === null ? onDay : takeLocalTime(onDay, time)
}
