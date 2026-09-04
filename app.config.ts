import type { ExpoConfig } from 'expo/config'

import { dark } from './src/ui/theme'

/**
 * PLACEHOLDER PACKAGE ID.
 *
 * `com.example.reader` is not the shipping identifier. The Android package id cannot be
 * changed after the first Play Store publish, so it must be settled before Slice 11.
 * See the pre-Slice-0 checklist in `docs/00-START-HERE.md`.
 */
const PACKAGE_ID = 'com.example.reader'

/**
 * Plus Jakarta Sans, embedded at BUILD time rather than loaded at runtime.
 *
 * The theme has always declared `font.family = 'PlusJakartaSans'`, and until now nothing
 * installed it and nothing applied it: every string in the app rendered in Roboto while
 * the design system claimed otherwise.
 *
 * Embedded rather than `useFonts()` because the cold-start budget is under two seconds
 * and a runtime load means either a blocked splash screen or a visible reflow when the
 * real face arrives. The `fontDefinitions` form generates an Android XML font family, so
 * one `fontFamily: 'PlusJakartaSans'` plus a `fontWeight` resolves to the right file —
 * the plain `fonts: [...]` array does NOT do weight mapping on Android, and every weight
 * would silently render as whichever file loaded first.
 *
 * Changing this list requires a native rebuild (`npx expo run:android`).
 */
const JAKARTA = '@expo-google-fonts/plus-jakarta-sans'
const fontWeights = [
  ['400Regular', 400],
  ['500Medium', 500],
  ['600SemiBold', 600],
  ['700Bold', 700],
  ['800ExtraBold', 800],
] as const

const config: ExpoConfig = {
  name: 'Reader',
  slug: 'reader-app',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'reader',
  userInterfaceStyle: 'automatic',
  // Android only for v1. See ADR 001.
  // The New Architecture is the default and no longer a config flag on SDK 57.
  platforms: ['android'],
  android: {
    package: PACKAGE_ID,
    adaptiveIcon: {
      // The ground colour, imported rather than copied. A second hex here is a second
      // place the brand colour lives, and the one that never gets updated.
      backgroundColor: dark.ground,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  // Kept in sync with what `npx expo install` reports as needing a config plugin.
  // There is deliberately no app.json: this file is the single source of app config.
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-sqlite',
    [
      'expo-font',
      {
        android: {
          fonts: [
            {
              fontFamily: 'PlusJakartaSans',
              fontDefinitions: fontWeights.map(([dir, weight]) => ({
                path: `./node_modules/${JAKARTA}/${dir}/PlusJakartaSans_${dir}.ttf`,
                weight,
              })),
            },
          ],
        },
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    // Public keys only. Real secrets live in EAS Secrets. See docs/06-CONVENTIONS.md.
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? null,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null,
  },
}

export default config
