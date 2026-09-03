/**
 * src/ui/Card.tsx
 *
 * Card r18, active and resting variants. Dock r22 with the accent wash.
 * Sibling groups use `gap`, never margins on children.
 */

import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'

import { radius, space } from './theme'
import { useColors } from './useTheme'

interface Props {
  children: ReactNode
  /** `active` is the book currently being read; `dock` is the accent "pick up where you left off". */
  variant?: 'resting' | 'active' | 'dock'
  onPress?: () => void
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

export function Card({ children, variant = 'resting', onPress, accessibilityLabel, style }: Props) {
  const c = useColors()

  const shape: ViewStyle =
    variant === 'dock'
      ? {
          backgroundColor: c.accentSurface,
          borderColor: c.accentBorder,
          borderRadius: radius.sheet,
          padding: space.cardTight,
        }
      : variant === 'active'
        ? {
            backgroundColor: c.surfaceRaised,
            borderColor: c.borderStrong,
            borderRadius: radius.card,
            padding: space.cardTight,
          }
        : {
            backgroundColor: c.surface,
            borderColor: c.border,
            borderRadius: radius.card,
            padding: space.cardTight,
          }

  const content = <View style={[styles.base, shape, style]}>{children}</View>

  if (!onPress) return content

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { borderWidth: 1 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
})
