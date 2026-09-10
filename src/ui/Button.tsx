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

import { font, motion, opacity, radius, rules, size, space, typeStyle } from './theme'
import { useColors } from './useTheme'

/**
 * `ghost` is an extension to the four variants on the Components sheet: a label with no
 * background and no border, for the low-emphasis half of a pair where the design draws
 * plain text — "Discard it" under "Save this session" on the recovery sheet.
 *
 * It lives here rather than as a bare Pressable in the feature file so that its hit
 * target, press feedback, debounce and font-scale cap are the same as every other button
 * in the app. A plain `<Text onPress>` is how a 42px tap target and an un-debounced
 * destructive action get shipped. See DECISIONS.md, 2026-09-10.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'pill' | 'danger' | 'ghost'

interface Props {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  /** Present participle shown while working, e.g. "Saving". Same width, no jump. */
  busyLabel?: string | undefined
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
  /**
   * MIN height, never a fixed one.
   *
   * These were fixed heights with `numberOfLines={1}`, which clips every label at large
   * system font scales. `06-CONVENTIONS.md` requires every layout to survive 200% —
   * it is one Android setting, and the primitives were the thing breaking it. A button
   * that grows taller is correct; a button whose label is cut in half is not.
   */
  const minHeight =
    variant === 'primary'
      ? size.buttonPrimary
      : variant === 'pill'
        ? size.pill
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
            paddingHorizontal: space.pillPadX,
          }
        : variant === 'danger'
          ? {
              backgroundColor: c.dangerSurface,
              borderRadius: radius.buttonSmall,
              borderWidth: 1,
              borderColor: c.dangerBorder,
            }
          : variant === 'ghost'
            ? { backgroundColor: 'transparent', borderRadius: radius.buttonSmall }
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
          : variant === 'ghost'
            ? c.textMuted
            : c.text

  // Named sizes from the scale. These were `font.bodyStrong.size + 1` and
  // `font.body.size + 0.5`: sizes that did not exist, written to look like they did.
  const textToken =
    variant === 'primary' ? font.button : variant === 'pill' ? font.pillLabel : font.buttonSmall

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
        { minHeight: variant === 'pill' ? size.minTouch : minHeight },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {busy ? <ActivityIndicator size="small" color={textColor} /> : null}
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(textToken), { color: textColor }]}
        >
          {busy ? (busyLabel ?? label) : label}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.buttonPadX,
    // Vertical padding, so a wrapped label is never flush against the edge.
    paddingVertical: space.labelGap,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.row },
  pressed: { transform: [{ scale: motion.press.scale }] },
  disabled: { opacity: opacity.disabled },
})
