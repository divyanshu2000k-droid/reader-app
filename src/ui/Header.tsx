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
import {
  font,
  iconSize,
  iconStroke,
  motion,
  radius,
  rules,
  size,
  space,
  typeStyle,
} from './theme'
import { usePressGuard } from './usePressGuard'
import { useColors } from './useTheme'

/**
 * `title` is optional because book detail's header is only its two buttons: the book's own
 * title is the hero below it, and repeating it here would say it twice.
 */
export function Header({
  title,
  left,
  right,
  compact = false,
}: {
  title?: string
  left?: ReactNode
  right?: ReactNode
  /**
   * A small centred title between two buttons, for a task screen rather than a destination:
   * "Log a session" in Session.dc.html is 15/600 between Back and a spacer, not 25/700.
   */
  compact?: boolean
}) {
  const c = useColors()
  return (
    <View style={styles.row}>
      {left ? <View style={styles.right}>{left}</View> : null}
      {/* No title means a spacer, not an empty Text: TalkBack would announce a blank header. */}
      {title ? (
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[
            typeStyle(compact ? font.bodyStrong : font.title),
            styles.title,
            compact && styles.centred,
            { color: c.text },
          ]}
        >
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}
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
  // A double tap on the settings gear pushed Settings twice (ui/pressGuard.ts).
  const guarded = usePressGuard(onPress)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={size.iconButtonHitSlop}
      onPress={guarded}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: c.surfaceRaised, borderColor: c.borderStrong },
        pressed && styles.pressed,
      ]}
    >
      <Icon
        name={icon}
        size={iconSize.header}
        color={c.textSecondary}
        strokeWidth={iconStroke.header}
      />
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
  centred: { textAlign: 'center' },
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
