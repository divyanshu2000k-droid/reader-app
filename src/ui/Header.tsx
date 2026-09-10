/**
 * src/ui/Header.tsx
 *
 * A screen title with an optional row of controls on the right. From Main.dc.html:
 * "The library" at 25/700 with 38px circular icon buttons beside it.
 *
 * `HeaderIconButton` is 38px visually and pads its hit area to 44 with `hitSlop`, because
 * nothing tappable may be under 44px and the header is where that rule breaks first.
 */

import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Icon, type IconName } from './Icon'
import { font, motion, radius, rules, size, space, typeStyle } from './theme'
import { useColors } from './useTheme'

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  const c = useColors()
  return (
    <View style={styles.row}>
      <Text
        accessibilityRole="header"
        numberOfLines={2}
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.title), styles.title, { color: c.text }]}
      >
        {title}
      </Text>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  )
}

interface IconButtonProps {
  icon: IconName
  accessibilityLabel: string
  onPress: () => void
}

export function HeaderIconButton({ icon, accessibilityLabel, onPress }: IconButtonProps) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={size.iconButtonHitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: c.surfaceRaised, borderColor: c.borderStrong },
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={17} color={c.textSecondary} strokeWidth={2} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.cardTight,
    paddingTop: space.section,
    paddingBottom: space.section,
  },
  title: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.cardTight },
  iconButton: {
    width: size.iconButton,
    height: size.iconButton,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: motion.press.scale }] },
})
