/**
 * src/ui/ConfirmSheet.tsx
 *
 * One question, two answers, in a sheet: "Delete this session?", "Discard changes?". The copy
 * comes from `confirm` in lib/strings.ts, so the same question is asked the same way
 * everywhere.
 *
 * A confirm that deletes must NOT raise its undo toast while this sheet is still up: the toast
 * renders beneath a Modal and would be invisible for the seconds it exists (05-BUILD-PLAN,
 * Slice 3). Callers close the sheet and leave the screen first, then raise the toast.
 */

import { Text } from 'react-native'

import { Button } from './Button'
import { Sheet } from './Sheet'
import { font, rules, typeStyle } from './theme'
import { useColors } from './useTheme'

interface Props {
  visible: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  /** A destructive confirmation is drawn as danger. */
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const c = useColors()
  return (
    <Sheet visible={visible} onClose={onCancel} title={title}>
      <Text
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.body), { color: c.textMuted }]}
      >
        {body}
      </Text>
      <Button
        label={confirmLabel}
        variant={danger ? 'danger' : 'primary'}
        busy={busy}
        onPress={onConfirm}
      />
      <Button label={cancelLabel} variant="ghost" disabled={busy} onPress={onCancel} />
    </Sheet>
  )
}
