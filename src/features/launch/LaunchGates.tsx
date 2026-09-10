/**
 * src/features/launch/LaunchGates.tsx
 *
 * Renders whichever gate currently wins, or the app once every gate has passed. The gate
 * ORDER lives in useLaunchGates.ts; this file only maps a decision to a screen and owns
 * the splash.
 *
 * Gates are rendered state, never routes. Navigating imperatively before the root layout
 * has mounted a navigator throws, and a gate that is a route sits in the back stack where
 * Android's back button can return the reader to it, and is deep-linkable besides.
 *
 * ─── THE SPLASH MUST ALWAYS HIDE ─────────────────────────────────────────────
 *
 * On Android, hiding the splash is not cosmetic: it is a pre-draw listener that returns
 * false until released, so a splash that never hides means NOTHING draws — not the
 * library, not an error screen, nothing. It is hidden as soon as any gate reaches a
 * decision, and a failsafe hides it after `SPLASH_FAILSAFE_MS` regardless, so a gate that
 * hangs shows the reader a stuck screen they can see rather than a frozen splash they
 * cannot interpret.
 */

import * as SplashScreen from 'expo-splash-screen'
import { useEffect, type ReactNode } from 'react'

import { MigrationFailed } from './components/MigrationFailed'
import { SessionRecoverySheet } from './components/SessionRecoverySheet'
import { UpdateRequired } from './components/UpdateRequired'
import { useDevicePassAutorun } from '@/db/devPass'
import { useLaunchGates } from './useLaunchGates'

/** Longer than the 2s force-update timeout plus a cold migration; shorter than patience. */
const SPLASH_FAILSAFE_MS = 4000

/**
 * The exit fade. The default is 400ms — half the 800ms splash budget — and it applies on
 * Android even though the type marks `fade` as iOS-only.
 */
const SPLASH_FADE_MS = 150

function hideSplash() {
  try {
    SplashScreen.setOptions({ duration: SPLASH_FADE_MS, fade: true })
  } catch {
    // Options are cosmetic. Hiding is not.
  }
  SplashScreen.hideAsync().catch(() => undefined)
}

export function LaunchGates({ children }: { children: ReactNode }) {
  const { state, migration, resolveSession } = useLaunchGates()
  const decided = state.gate !== 'booting'

  useEffect(() => {
    const failsafe = setTimeout(hideSplash, SPLASH_FAILSAFE_MS)
    return () => clearTimeout(failsafe)
  }, [])

  useEffect(() => {
    if (decided) hideSplash()
  }, [decided])

  useDevicePassAutorun(state.gate === 'ready')

  switch (state.gate) {
    case 'booting':
      // The splash is still up. Rendering nothing is correct: the reader sees the splash.
      return null
    case 'update':
      return <UpdateRequired requirement={state.requirement} />
    case 'migrationFailed':
      return (
        <MigrationFailed
          error={state.error}
          retrying={migration.retrying}
          onRetry={migration.retry}
        />
      )
    case 'recoverSession':
      return <SessionRecoverySheet session={state.session} onResolved={resolveSession} />
    case 'ready':
      return <>{children}</>
  }
}
