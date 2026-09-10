/**
 * src/lib/config.ts
 *
 * The ONLY reader of the app's optional public configuration, and the only place
 * `expo-constants` is imported.
 *
 * Everything here is optional and everything defaults to off. A fresh clone with no
 * `.env` must build, launch and work — so each value is `null` rather than a throw, and
 * every caller treats `null` as "this feature is not configured". A config reader that
 * throws on a missing key turns an absent optional integration into a crash on the
 * launch path, which is the opposite of what it is for.
 *
 * ─── WHY process.env AND NOT expo-constants' `extra` ─────────────────────────
 *
 * These used to be read from `Constants.expoConfig.extra`, and on a device the flag URL
 * was null while Metro's manifest plainly contained it. `expo-constants` reads the
 * `app.config` EMBEDDED IN THE APK at native build time — even in a development build —
 * not the manifest Metro serves. So a value added to `.env` did nothing until the next
 * full `npx expo run:android`, and restarting Metro, the obvious thing to try, changed
 * nothing and said nothing.
 *
 * `process.env.EXPO_PUBLIC_*` is inlined by Metro at BUNDLE time, so a Metro restart
 * with `--clear` is genuinely enough, and a release build still carries the value baked
 * in. Each read MUST be a literal `process.env.EXPO_PUBLIC_NAME` member expression:
 * destructuring or `process.env[name]` is not inlined and is silently undefined on a
 * device, while the `.env` file looks perfectly correct.
 */

import Constants from 'expo-constants'

/** Unset, or the empty string an unset `.env` line produces, both mean "not configured". */
function value(raw: string | undefined): string | null {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
}

export const config = {
  sentryDsn: value(process.env.EXPO_PUBLIC_SENTRY_DSN),
  supabaseUrl: value(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: value(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  forceUpdateUrl: value(process.env.EXPO_PUBLIC_FORCE_UPDATE_URL),
} as const

/**
 * The app's own version, as shown to the reader and as compared against the force-update
 * flag. The `version` field from `app.config.ts`. Read from the embedded config on
 * purpose: unlike the values above, it genuinely is a build-time fact.
 *
 * NULL WHEN IT CANNOT BE READ, and the force-update gate skips its check when it is null.
 *
 * The tempting fallback is `'0.0.0'`, and it is a trap: it sits below every plausible
 * minimum, so an app that could not read its own version would show the update screen —
 * which has no dismiss — on every launch, forever, with no way out but reinstalling. That
 * is a brick dressed as a safe default. Not knowing our own version is exactly the case
 * where we have no business blocking anybody.
 */
export const appVersion: string | null =
  typeof Constants.expoConfig?.version === 'string' && Constants.expoConfig.version.length > 0
    ? Constants.expoConfig.version
    : null

/**
 * The Android package id, used to derive the Play Store URL locally rather than trusting
 * a remote payload to name where the update button sends the reader. A build-time fact.
 */
export const androidPackage: string | null =
  typeof Constants.expoConfig?.android?.package === 'string'
    ? Constants.expoConfig.android.package
    : null
