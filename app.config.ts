import type { ExpoConfig } from 'expo/config'

import brand from './src/ui/brand.json'

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
  /**
   * REQUIRES `expo-system-ui` IN dependencies. Nothing imports that package, so it looks
   * unused and invites deletion — but without it this setting is silently ignored, the
   * system colour scheme never reaches `useColors()`, and light mode stops existing.
   * Both themes are a free-tier promise in docs/08-MONETISATION.md.
   */
  userInterfaceStyle: 'automatic',
  // Android only for v1. See ADR 001.
  // The New Architecture is the default and no longer a config flag on SDK 57.
  platforms: ['android'],
  android: {
    package: PACKAGE_ID,
    adaptiveIcon: {
      // The ground colour, imported rather than copied. A second hex here is a second
      // place the brand colour lives, and the one that never gets updated.
      //
      // JSON, not `theme.ts`: Expo transpiles this file and evaluates it in plain Node,
      // which cannot require a TypeScript module. Importing the theme here fails the
      // BUILD, not the typecheck — `npx expo run:android` was how it surfaced.
      backgroundColor: brand.ground,
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
    /**
     * The Android 12+ system splash. Configured here rather than drawn in JS because the
     * system shows it before any JS exists — which is the only way to hit the sub-800ms
     * budget in docs/05-BUILD-PLAN.md. `src/features/launch` only decides when to HIDE it.
     *
     * The base colours are light mode; `dark` overrides them. Both come from brand.json
     * for the same reason the adaptive icon does.
     */
    [
      'expo-splash-screen',
      {
        backgroundColor: brand.groundLight,
        image: './assets/splash-icon.png',
        imageWidth: 180,
        dark: {
          backgroundColor: brand.ground,
          image: './assets/splash-icon.png',
          imageWidth: 180,
        },
      },
    ],
    /**
     * Sentry. The plugin's job is the BUILD-time half: uploading source maps so a stack
     * trace from a minified release bundle is readable. That upload needs
     * `SENTRY_AUTH_TOKEN`, which is a REAL secret and lives in EAS Secrets, never here
     * and never in git. The DSN below is a public key and is a different thing entirely.
     *
     * With no org/project configured the plugin is inert, so the app builds and runs
     * before a Sentry account exists.
     */
    '@sentry/react-native',
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
  // No `extra` keys for optional services. They are read as `process.env.EXPO_PUBLIC_*` in
  // src/lib/config.ts, inlined by Metro at bundle time. Putting them here as well made a
  // second copy that `expo-constants` reads from the APK — frozen at native build time, so
  // a `.env` change silently did nothing until a full rebuild. See DECISIONS.md, 2026-09-10.
}

export default config
