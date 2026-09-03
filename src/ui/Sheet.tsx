/**
 * src/ui/Sheet.tsx
 *
 * Bottom sheet, r22 on the top corners, scrim behind.
 *
 * Motion comes from the tokens and is actually applied: the sheet slides over
 * `motion.sheetUp.duration` and the scrim fades over `motion.scrimFade.duration`. The
 * Modal's own `animationType` is off, because it would run its own timing alongside
 * ours. Reduce-motion drops both to zero rather than switching to a second animation.
 *
 * Back always works and never loses unsaved input: `onRequestClose` fires for the
 * hardware back button, and the caller decides whether to warn before discarding.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { font, motion, radius, scrim, space } from './theme'
import { useColors } from './useTheme'

interface Props {
  visible: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Set false for a sheet that must be answered, e.g. session recovery. */
  dismissable?: boolean
}

export function Sheet({ visible, onClose, title, children, dismissable = true }: Props) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const reduced = useReducedMotion()

  // The Modal must stay mounted through the exit animation, so `mounted` lags `visible`
  // on the way out. Adjusting it during render rather than in an effect is React's
  // documented pattern for deriving state from changed props, and avoids the cascading
  // render that a setState-in-effect would cause.
  const [prevVisible, setPrevVisible] = useState(visible)
  const [mounted, setMounted] = useState(visible)
  if (prevVisible !== visible) {
    setPrevVisible(visible)
    if (visible) setMounted(true)
  }

  const progress = useSharedValue(visible ? 1 : 0)

  useEffect(() => {
    const duration = reduced ? motion.reducedMotionDuration : motion.sheetUp.duration
    if (visible) {
      progress.value = withTiming(1, { duration })
      return
    }
    progress.value = withTiming(0, { duration }, (finished) => {
      if (finished) runOnJS(setMounted)(false)
    })
  }, [visible, reduced, progress])

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: withTiming(progress.value, {
      duration: reduced ? motion.reducedMotionDuration : motion.scrimFade.duration,
    }),
  }))

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * height }],
  }))

  if (!mounted) return null

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissable ? onClose : undefined}
    >
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable
          accessibilityLabel={dismissable ? 'Close' : undefined}
          style={StyleSheet.absoluteFill}
          onPress={dismissable ? onClose : undefined}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          sheetStyle,
          {
            backgroundColor: c.ground,
            borderColor: c.border,
            maxHeight: height * 0.9,
            paddingBottom: insets.bottom + space.bottomSafe,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: c.textGhost }]} />
        {title ? (
          <Text
            accessibilityRole="header"
            style={{
              color: c.text,
              fontSize: font.heading.size,
              fontWeight: '600',
              paddingHorizontal: space.screen,
              paddingBottom: 12,
            }}
          >
            {title}
          </Text>
        ) : null}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: space.screen, gap: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
    opacity: 0.6,
  },
})
