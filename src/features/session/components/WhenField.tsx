/**
 * "When", from Session.dc.html: the most important field on the most important screen.
 *
 * Prominent, always editable, and saying so: "Any date, any time, and you can change it after
 * saving." A session for last Tuesday is the case the whole product rests on (05-BUILD-PLAN,
 * Slice 3), so this is a full-width field, never a small link.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native'

import { pickWhen } from '../pickWhen'
import { formatWhen, now, type UnixMs } from '@/lib/dates'
import { Icon } from '@/ui/Icon'
import { font, iconSize, motion, radius, rules, size, space, typeStyle } from '@/ui/theme'
import { usePressGuard } from '@/ui/usePressGuard'
import { useColors } from '@/ui/useTheme'

interface Props {
  value: UnixMs
  onChange: (next: UnixMs) => void
  error?: string | undefined
  /** False on Session complete, where the card has no room for the explanation. */
  showHelp?: boolean
  label?: string
}

export function WhenField({ value, onChange, error, showHelp = true, label = 'When' }: Props) {
  const c = useColors()
  const text = formatWhen(value)
  const open = usePressGuard(() => {
    void pickWhen(value, now()).then((next) => {
      if (next !== null) onChange(next)
    })
  })

  return (
    <View style={styles.wrap}>
      <Text
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.label), { color: c.textMuted }]}
      >
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${text}`}
        accessibilityHint="Opens a date picker, then a time picker"
        onPress={open}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: error ? c.dangerSurface : c.surface,
            borderColor: error ? c.dangerBorder : c.border,
            borderRadius: radius.field,
          },
          pressed && styles.pressed,
        ]}
      >
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.bodyStrong), styles.value, { color: c.text }]}
        >
          {text}
        </Text>
        <Icon name="chevron" size={iconSize.header} color={c.textFaint} />
      </Pressable>
      {error ? (
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.label), { color: c.danger }]}
        >
          {error}
        </Text>
      ) : showHelp ? (
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.secondary), { color: c.textMuted }]}
        >
          Any date, any time, and you can change it after saving.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.labelGap },
  field: {
    minHeight: size.field,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.row,
    paddingHorizontal: space.fieldPadX,
    paddingVertical: space.fieldPadY,
    borderWidth: 1,
  },
  value: { flex: 1 },
  pressed: { transform: [{ scale: motion.press.scale }] },
})
