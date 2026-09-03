/**
 * src/ui/Skeleton.tsx
 *
 * Shimmer sweeps left to right, 1.4s, infinite. Skeleton rows use the exact geometry of
 * the real row so nothing shifts on load.
 *
 * `SkeletonGate` enforces the 400ms rule: anything faster shows no loading state at
 * all, because a flashed skeleton looks broken. That rule is easy to state and easy to
 * forget, so it lives in a component rather than in a comment.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { motion, radius, rules, size } from './theme'
import { useColors } from './useTheme'

interface SkeletonProps {
  width?: number | `${number}%`
  height?: number
  style?: StyleProp<ViewStyle>
}

export function Skeleton({ width = '100%', height = 12, style }: SkeletonProps) {
  const c = useColors()
  const shimmer = useSharedValue(0)

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: motion.shimmer.duration }),
      -1,
      false,
    )
  }, [shimmer])

  const sweep = useAnimatedStyle(() => ({ opacity: 0.35 + shimmer.value * 0.35 }))

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: 6, backgroundColor: c.surfaceRaised },
        sweep,
        style,
      ]}
    />
  )
}

/** The exact geometry of a Library row, so nothing shifts when the real data lands. */
export function SkeletonBookRow() {
  const c = useColors()
  return (
    <View style={[styles.row, { borderColor: c.border, borderRadius: radius.card }]}>
      <Skeleton width={size.coverList.w} height={size.coverList.h} style={{ borderRadius: radius.cover }} />
      <View style={styles.rowText}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} />
        <Skeleton width="100%" height={size.progressBar} />
      </View>
    </View>
  )
}

/**
 * Renders `children` once loading finishes. While loading, shows `fallback` only if the
 * wait exceeds 400ms.
 */
export function SkeletonGate({
  loading,
  fallback,
  children,
}: {
  loading: boolean
  fallback: ReactNode
  children: ReactNode
}) {
  const [showFallback, setShowFallback] = useState(false)

  // The reset lives in the cleanup rather than in the effect body: setting state
  // synchronously while rendering causes a cascading render, and the reset only needs to
  // happen when `loading` changes, which is exactly when cleanup runs.
  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => setShowFallback(true), rules.loadingThresholdMs)
    return () => {
      clearTimeout(timer)
      setShowFallback(false)
    }
  }, [loading])

  if (loading) return showFallback ? <>{fallback}</> : null
  return <>{children}</>
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, padding: 12, borderWidth: 1, alignItems: 'center' },
  rowText: { flex: 1, gap: 8 },
})
