import type { ExpoConfig } from 'expo/config'

/**
 * PLACEHOLDER PACKAGE ID.
 *
 * `com.example.reader` is not the shipping identifier. The Android package id cannot be
 * changed after the first Play Store publish, so it must be settled before Slice 11.
 * See the pre-Slice-0 checklist in `docs/00-START-HERE.md`.
 */
const PACKAGE_ID = 'com.example.reader'

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
      backgroundColor: '#0B0A08',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  // Kept in sync with what `npx expo install` reports as needing a config plugin.
  // There is deliberately no app.json: this file is the single source of app config.
  plugins: ['expo-router', 'expo-status-bar', 'expo-sqlite'],
  experiments: { typedRoutes: true },
  extra: {
    // Public keys only. Real secrets live in EAS Secrets. See docs/06-CONVENTIONS.md.
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? null,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null,
  },
}

export default config
