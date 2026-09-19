/**
 * modules/reading-service/index.ts
 *
 * A REAL Android foreground service for a running reading session.
 *
 * ─── WHY THIS IS A LOCAL MODULE AND NOT A CONFIG PLUGIN ──────────────────────
 *
 * Slice 6 shipped a config plugin that declared a `<service>` pointing at
 * `expo.modules.notifications.service.NotificationForegroundService` — a class that does not
 * exist in `expo-notifications` and appears nowhere in `node_modules`. It merged into the
 * manifest, the build succeeded, and nothing ever ran. `dumpsys activity services` said
 * `(nothing)` and the app sat at `oom_score_adj` 900, which is the first thing Android kills.
 *
 * A config plugin can only ever declare. Something has to BE the service, and a local Expo
 * module is the smallest thing that can be: it lives in `modules/`, outside `android/`, so
 * `prebuild --clean` cannot wipe it, and it is autolinked without a third-party dependency.
 *
 * ─── THE SERVICE OWNS THE NOTIFICATION ───────────────────────────────────────
 *
 * `startForeground` requires the service to supply its own notification, so having JS post a
 * second one would put two entries in the reader's shade. `ui/timerNotification.ts` is a
 * wrapper over `start`/`stop` here; `expo-notifications` is still used, but only to ask for
 * the POST_NOTIFICATIONS permission.
 *
 * ─── ANDROID ONLY, BY DESIGN ─────────────────────────────────────────────────
 *
 * v1 is Android only (`02-ARCHITECTURE.md`). Every function here is a no-op elsewhere rather
 * than a throw, so nothing has to branch at the call site.
 */

import { requireOptionalNativeModule } from 'expo'
import { Platform } from 'react-native'

/** What the notification's buttons send back. Identical to `TIMER_ACTION` in `ui/`. */
export type ReadingServiceAction = 'timer-pause' | 'timer-resume' | 'timer-finish'

export interface ReadingServiceEvent {
  readonly action: ReadingServiceAction
}

interface Native {
  start(title: string, body: string, running: boolean): void
  stop(): void
  isRunning(): boolean
  lastNativeBeat(): number
  addListener(
    event: 'onAction',
    listener: (payload: ReadingServiceEvent) => void,
  ): { remove: () => void }
}

/**
 * `requireOptionalNativeModule`, not `requireNativeModule`.
 *
 * The module is absent in two situations that both have to keep working: a JS-only test
 * environment, and a dev client built before this module existed. A missing service costs
 * the reader background survival; a throw at import time costs them the app.
 */
const native = requireOptionalNativeModule<Native>('ReadingService')

/** Whether the native service is actually present in this build. */
export function isAvailable(): boolean {
  return Platform.OS === 'android' && native !== null
}

/**
 * Start the service, or update what a running one shows.
 *
 * Idempotent: calling it again replaces the notification rather than starting a second
 * service, so the pause/resume path is the same call as the start path.
 */
export function start(title: string, body: string, running: boolean): void {
  if (!isAvailable()) return
  native?.start(title, body, running)
}

export function stop(): void {
  if (!isAvailable()) return
  native?.stop()
}

/** Android's own view of whether the service is up, not JavaScript's belief about it. */
export function isRunning(): boolean {
  if (!isAvailable()) return false
  return native?.isRunning() ?? false
}

/**
 * The last moment the NATIVE heartbeat proved the app was alive, or 0 for never.
 *
 * The JavaScript heartbeat stops the instant the app is backgrounded — React Native's timers
 * are driven by frame callbacks and a backgrounded app draws no frames — which is precisely
 * the situation a heartbeat exists for. Measured on a phone on 2026-09-19: 2 beats in 75
 * seconds in the foreground, 0 in the next 75 backgrounded, 0 in six minutes of doze.
 *
 * The service beats on its own `HandlerThread`, which has nothing to do with frames. Recovery
 * takes the later of the two.
 */
export function lastNativeBeat(): number {
  if (!isAvailable()) return 0
  return native?.lastNativeBeat() ?? 0
}

export function addActionListener(listener: (action: ReadingServiceAction) => void): {
  remove: () => void
} {
  if (!isAvailable()) return { remove: () => undefined }
  const sub = native?.addListener('onAction', (payload) => listener(payload.action))
  return sub ?? { remove: () => undefined }
}
