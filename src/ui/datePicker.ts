/**
 * src/ui/datePicker.ts
 *
 * Android's own date and time dialogs, as a promise. Accessible, localised, and the ones the
 * reader already knows (DECISIONS.md, 2026-09-13). Shared by the session logger's "When" and the
 * finish flow's date, so neither carries its own copy of the dialog handling.
 */

import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'

import type { UnixMs } from '@/lib/dates'

/**
 * One dialog. Resolves to the picked instant, or null when dismissed. `max` caps the date
 * dialog only: Android's time dialog has no maximum, so a caller that refuses a later time of
 * day says so in its own form.
 */
export function openPicker(
  mode: 'date' | 'time',
  value: UnixMs,
  max: UnixMs,
): Promise<UnixMs | null> {
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
