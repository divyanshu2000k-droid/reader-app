/**
 * src/ui/ProgressBar.tsx
 *
 * h3 r3. Accent gradient for the active book, flat grey for every other. That colour
 * split is from the Components sheet and is how the eye finds the current read in a
 * list of forty.
 *
 * Grows to its new width over 400ms, per the Motion section. Honours reduce-motion by
 * dropping the duration to zero rather than by having a second animation.
 */

import { useEffect } from 'react'
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { motion, size } from './theme'
import { useColors } from './useTheme'

interface Props {
  /** 0 to 1. Pass null when the book has no page count: renders an empty track. */
  fraction: number | null
  active?: boolean
  style?: StyleProp<ViewStyle>
}

export function ProgressBar({ fraction, active = false, style }: Props) {
  const c = useColors()
  const width = useSharedValue(0)

  useEffect(() => {
    let cancelled = false
    const target = Math.max(0, Math.min(fraction ?? 0, 1)) * 100
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return
      width.value = withTiming(target, {
        duration: reduced ? motion.reducedMotionDuration : motion.progressBar.duration,
      })
    })
    return () => {
      cancelled = true
    }
  }, [fraction, width])

  const fill = useAnimatedStyle(() => ({ width: `${width.value}%` }))

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={
        fraction === null ? undefined : { min: 0, max: 100, now: Math.round(fraction * 100) }
      }
      style={[styles.track, { backgroundColor: c.border }, style]}
    >
      <Animated.View
        style={[
          styles.fill,
          fill,
          { backgroundColor: active ? c.accent : c.textGhost },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  track: { height: size.progressBar, borderRadius: size.progressBar, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: size.progressBar },
})
