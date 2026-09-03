/**
 * src/ui/Chip.tsx
 *
 * Filter chips, r999. Selected is a solid light fill with dark ink; unselected is a
 * faint surface. Also the quick-add chips on the log-session screen.
 *
 * The touch target is padded to 44px even though the visual pill is shorter. Four quick
 * add chips in a row on a 360px screen is the tightest layout in the app and the first
 * thing the States sheet says to test.
 */

import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'

import { font, radius, size } from './theme'
import { useColors } from './useTheme'

interface Props {
  label: string
  selected?: boolean
  onPress: () => void
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

export function Chip({ label, selected = false, onPress, accessibilityLabel, style }: Props) {
  const c = useColors()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: radius.chip,
          minHeight: size.minTouch,
          backgroundColor: selected ? c.text : c.surfaceRaised,
          borderColor: selected ? c.text : c.border,
        },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          color: selected ? c.ground : c.textMuted,
          fontSize: font.secondary.size + 1,
          fontWeight: selected ? '600' : '500',
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pressed: { transform: [{ scale: 0.97 }] },
})
