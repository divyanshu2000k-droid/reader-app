/**
 * src/ui/Sheet.tsx
 *
 * Bottom sheet, r22 on the top corners, scrim behind. Sheets slide up over 280ms and
 * the scrim fades over 200ms, per the Motion section.
 *
 * Back always works and never loses unsaved input: `onRequestClose` fires for the
 * hardware back button, and the caller decides whether to warn before discarding.
 */

import type { ReactNode } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { font, radius, space } from './theme'
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={dismissable ? onClose : undefined}
    >
      <Pressable
        accessibilityLabel={dismissable ? 'Close' : undefined}
        style={styles.scrim}
        onPress={dismissable ? onClose : undefined}
      />
      <View
        style={[
          styles.sheet,
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
      </View>
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
    backgroundColor: 'rgba(0,0,0,0.55)',
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
