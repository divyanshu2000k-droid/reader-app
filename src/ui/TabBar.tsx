/**
 * src/ui/TabBar.tsx
 *
 * Library · Add · Stats, with Add as a raised centre button. From Main.dc.html.
 *
 * THE RAISED BUTTON STAYS INSIDE THE BAR'S BOUNDS. The design draws it at `top: -28px`,
 * overhanging the bar, and on Android that is a trap: a view positioned outside its
 * parent's bounds is only reliably tappable when view flattening is on, which Reanimated
 * routinely turns off — the failure is half a button that renders correctly and ignores
 * taps. So the bar is `tabRaise` taller than it looks, the hairline is drawn `tabRaise`
 * down, and the circle overlaps the hairline while sitting wholly inside the container.
 *
 * Custom rather than the built-in bar because the built-in one cannot draw the raised
 * button. Two consequences, both handled here: routes are matched by name and anything
 * unknown is not rendered (`href: null` is ignored by a custom bar), and the bar reports
 * its real height to `BottomTabBarHeightCallbackContext` so screens measuring it get the
 * truth rather than the default bar's height.
 */

import { useContext } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/build/react-navigation/bottom-tabs'

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
import { useColors } from './useTheme'
import { nav } from '@/lib/strings'

interface TabSpec {
  readonly label: string
  readonly icon: IconName
  readonly raised?: boolean
}

/** Keyed by route file name under src/app/(tabs)/. Labels from strings.ts `nav`. */
const TABS: Readonly<Record<string, TabSpec>> = {
  index: { label: nav.library.tab, icon: 'book' },
  add: { label: nav.add.tab, icon: 'plus', raised: true },
  stats: { label: nav.stats.tab, icon: 'chart' },
}

export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const c = useColors()
  const reportHeight = useContext(BottomTabBarHeightCallbackContext)

  const onLayout = (e: LayoutChangeEvent) => reportHeight?.(e.nativeEvent.layout.height)

  return (
    <View
      accessibilityRole="tablist"
      onLayout={onLayout}
      style={[styles.bar, { backgroundColor: c.ground, paddingBottom: insets.bottom }]}
    >
      <View style={[styles.hairline, { backgroundColor: c.borderStrong }]} />
      {state.routes.map((route, index) => {
        const spec = TABS[route.name]
        if (!spec) return null
        const focused = state.index === index

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          })
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name)
        }

        // Idle labels were textFaint (2.41:1 in light mode). A label is text, so textMuted;
        // idle and raised now differ by weight alone. The idle ICON keeps textFaint (3:1).
        const labelColor = focused ? c.accentInk : c.textMuted

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={spec.label}
            onPress={onPress}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            {spec.raised ? (
              <View
                style={[styles.raised, { backgroundColor: c.accent, borderColor: c.ground }]}
              >
                <Icon
                  name={spec.icon}
                  size={iconSize.raised}
                  color={c.onAccent}
                  strokeWidth={iconStroke.raised}
                />
              </View>
            ) : (
              <Icon name={spec.icon} color={focused ? c.accentInk : c.textFaint} />
            )}
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[
                typeStyle(focused ? font.tabFocused : spec.raised ? font.tabRaised : font.tab),
                { color: labelColor },
              ]}
            >
              {spec.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: size.tabBar + size.tabRaise,
  },
  // The visible top edge of the bar, drawn below the transparent raise zone.
  hairline: {
    position: 'absolute',
    top: size.tabRaise,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    minHeight: size.minTouch,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.tabLabel,
    paddingBottom: space.row,
  },
  raised: {
    width: size.tabRaised,
    height: size.tabRaised,
    borderRadius: radius.pill,
    borderWidth: size.tabRaiseRing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: motion.press.scale }] },
})
