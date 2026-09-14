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

import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'

import { takeLocalDate, takeLocalTime, type UnixMs } from '@/lib/dates'

function open(mode: 'date' | 'time', value: UnixMs, max: UnixMs): Promise<UnixMs | null> {
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      mode,
      value: new Date(value),
      ...(mode === 'date' ? { maximumDate: new Date(max) } : {}),
      // Not `onChange`: deprecated in v9, and its warning raised LogBox's toast over the
      // screen on the phone, which swallows taps (DECISIONS.md, 2026-09-10).
      onValueChange: (_event, date) => resolve(date.getTime()),
      onDismiss: () => resolve(null),
    })
  })
}

/** Date then time. Resolves to the new instant, or null if the reader cancelled the date. */
export async function pickWhen(current: UnixMs, now: UnixMs): Promise<UnixMs | null> {
  const day = await open('date', current, now)
  if (day === null) return null
  const onDay = takeLocalDate(current, day)
  const time = await open('time', onDay, now)
  return time === null ? onDay : takeLocalTime(onDay, time)
}
