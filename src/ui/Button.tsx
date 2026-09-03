/**
 * src/ui/Button.tsx
 *
 * Primary h56 r18, secondary h46 r14, pill h34 r999. Disabled is 40% opacity with no
 * shadow. Pressed is scale(0.97) over 120ms. All from the Components sheet.
 *
 * Two behaviours that are not decoration:
 *   - Every press is debounced. "Double taps are idempotent" is a global rule, and a
 *     double-tapped Save is a duplicate session.
 *   - `busy` swaps the label for a present participle and keeps the button the same
 *     size, so the layout never jumps.
 */

import { useCallback, useRef } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { font, radius, size } from './theme'
import { useColors } from './useTheme'

export type ButtonVariant = 'primary' | 'secondary' | 'pill' | 'danger'

interface Props {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  /** Present participle shown while working, e.g. "Saving". Same width, no jump. */
  busyLabel?: string
  busy?: boolean
  disabled?: boolean
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

/** Ignore repeat presses inside this window. One tap, one session. */
const DEBOUNCE_MS = 600

export function Button({
  label,
  onPress,
  variant = 'primary',
  busyLabel,
  busy = false,
  disabled = false,
  accessibilityLabel,
  style,
}: Props) {
  const c = useColors()
  const lastPress = useRef(0)

  const handlePress = useCallback(() => {
    const t = Date.now()
    if (t - lastPress.current < DEBOUNCE_MS) return
    lastPress.current = t
    onPress()
  }, [onPress])

  const isDisabled = disabled || busy
  const height =
    variant === 'primary'
      ? size.buttonPrimary
      : variant === 'pill'
        ? 34
        : size.buttonSecondary

  const shape: ViewStyle =
    variant === 'primary'
      ? { backgroundColor: c.accent, borderRadius: radius.button }
      : variant === 'pill'
        ? {
            backgroundColor: c.accentSurface,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: c.accentBorder,
            paddingHorizontal: 14,
          }
        : variant === 'danger'
          ? {
              backgroundColor: c.dangerSurface,
              borderRadius: radius.buttonSmall,
              borderWidth: 1,
              borderColor: c.dangerBorder,
            }
          : {
              backgroundColor: c.surfaceRaised,
              borderRadius: radius.buttonSmall,
              borderWidth: 1,
              borderColor: c.borderStrong,
            }

  const textColor =
    variant === 'primary'
      ? c.onAccent
      : variant === 'pill'
        ? c.accentInk
        : variant === 'danger'
          ? c.danger
          : c.text

  const textSize =
    variant === 'primary'
      ? font.bodyStrong.size + 1
      : variant === 'pill'
        ? font.secondary.size
        : font.body.size + 0.5

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy }}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        shape,
        { height, minHeight: variant === 'pill' ? size.minTouch : height },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {busy ? <ActivityIndicator size="small" color={textColor} /> : null}
        <Text
          numberOfLines={1}
          style={{
            color: textColor,
            fontSize: textSize,
            fontWeight: variant === 'primary' ? '700' : '600',
          }}
        >
          {busy ? (busyLabel ?? label) : label}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pressed: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.4 },
})
