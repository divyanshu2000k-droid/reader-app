/**
 * src/ui/AppErrorBoundary.tsx
 *
 * The fallback for the root `ErrorBoundary` export in src/app/_layout.tsx. Tier 3.
 *
 * ZERO CONTEXT DEPENDENCIES, and that is the whole design constraint. When the root
 * boundary fires, expo-router replaces the ENTIRE tree beneath the root layout — every
 * provider is gone. A fallback that calls `useSafeAreaInsets`, `useToast` or anything
 * else that needs a provider throws inside the boundary and produces an unrecoverable
 * render loop (the shape of expo/expo#24242). So this uses no `Screen`, no `Notice`, no
 * `Button`: plain Views, the dark palette read directly, and `useColorScheme`, which is a
 * native hook rather than a context.
 *
 * It also hides the splash. On Android the splash is a blocking pre-draw listener: if a
 * render throws before the launch gates hide it, NOTHING draws — including this screen.
 *
 * "Restart" re-renders the tree through expo-router's `retry`. There is no full process
 * restart without `expo-updates`, which this app does not ship; a re-render re-runs every
 * gate, including a retry of any failed migration, which is what a restart would do.
 */

import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native'

import { dark, font, light, radius, rules, size, space, typeStyle } from './theme'
import { launch } from '@/lib/strings'
import { reportBoundaryError } from '@/lib/sentry'

interface Props {
  error: Error
  retry: () => Promise<void>
}

export function AppErrorBoundary({ error, retry }: Props) {
  const c = useColorScheme() === 'light' ? light : dark

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined)
    reportBoundaryError(error)
  }, [error])

  return (
    <View style={[styles.root, { backgroundColor: c.ground }]}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.notice), styles.centred, { color: c.text }]}
      >
        {launch.crashed.title}
      </Text>
      <Text
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.body), styles.centred, { color: c.textMuted }]}
      >
        {launch.crashed.body}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={launch.crashed.action}
        onPress={() => void retry()}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: c.accent },
          pressed && styles.pressed,
        ]}
      >
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.button), { color: c.onAccent }]}
        >
          {launch.crashed.action}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.stackTight,
    padding: space.screen,
  },
  centred: { textAlign: 'center' },
  button: {
    alignSelf: 'stretch',
    minHeight: size.buttonPrimary,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.section,
  },
  pressed: { opacity: 0.9 },
})
