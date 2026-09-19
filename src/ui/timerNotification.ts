/**
 * src/ui/timerNotification.ts
 *
 * THE NOTIFICATION THAT KEEPS THE TIMER ALIVE, and its Pause and Finish buttons.
 *
 * In `ui/` rather than in `features/timer` because TWO features need it, and features may not
 * import from one another (06-CONVENTIONS): the timer posts it, and the launch recovery gate
 * has to take it down after a crash. `ui/datePicker.ts` is the precedent — a platform
 * capability wrapped once and shared, rather than a design-system primitive.
 *
 * ─── IT IS NOT A PROGRESS BAR, IT IS THE THING KEEPING THE PROCESS ALIVE ─────
 *
 * On Android a foreground service must show a notification, and the OS kills a service whose
 * notification goes away. So this is not decoration: dismissing it, or failing to post it,
 * ends the timer. It is posted the moment a timer starts and cleared the moment one ends.
 *
 * ─── THIS FILE USED TO BE A LIE, AND IT IS WORTH KNOWING HOW ─────────────────
 *
 * Until 2026-09-19 every word above was true of the INTENT and false of the code. The
 * notification was posted through `expo-notifications`, and the foreground service was a
 * `<service>` entry in the manifest naming
 * `expo.modules.notifications.service.NotificationForegroundService` — a class that does not
 * exist in that library and appears nowhere in `node_modules`. Nothing started it; nothing
 * could have. On a real phone `dumpsys activity services` returned `(nothing)` and the
 * process sat at `oom_score_adj` 900, which is the first thing Android kills when it wants
 * memory. An ongoing notification looks identical either way, which is why it survived a
 * full slice and an audit.
 *
 * The notification now comes from `modules/reading-service`, a local Expo module wrapping a
 * real Kotlin `Service`. `startForeground` requires the service to supply its own
 * notification, so the service is the only thing that posts it — this file is the wrapper
 * that turns a timer's state into the two strings it shows.
 *
 * `expo-notifications` is still a dependency, and is now used for exactly one thing: asking
 * for the POST_NOTIFICATIONS permission (`features/timer/NotificationPriming.tsx`).
 *
 * ─── WHAT IT DOES NOT SAY ────────────────────────────────────────────────────
 *
 * **It does not tick.** A notification updated every second is a wakeup every second, and the
 * reader's battery pays for a number nobody is looking at — they are reading a book. It is
 * updated on state changes only: start, pause, resume. The elapsed time it shows is therefore
 * "since you started", phrased so it cannot be read as a live clock.
 *
 * Android's `usesChronometer` would tick without waking us, but it counts wall time from a
 * fixed instant and so cannot express "minus the nine minutes you were paused". A wrong
 * number that updates itself is worse than a right one that does not.
 */

import { Platform } from 'react-native'

import {
  addActionListener,
  isRunning as serviceIsRunning,
  start as startService,
  stop as stopService,
  type ReadingServiceAction,
} from '@/modules/reading-service'
import { noticeText, type TimerNotice } from './timerNotice'

/**
 * The copy and the button identifiers live in `timerNotice.ts`, which is pure and therefore
 * testable in node. Re-exported here so call sites have one import.
 */
export { TIMER_ACTION, TIMER_CHANNEL, noticeText, type TimerNotice } from './timerNotice'

/**
 * Start the foreground service, or replace what it is showing.
 *
 * Async only to keep the call sites unchanged from when this went through
 * `expo-notifications`; the native call itself returns immediately.
 */
export async function showTimerNotification(notice: TimerNotice): Promise<void> {
  if (Platform.OS !== 'android') return
  const { title, body } = noticeText(notice)
  startService(title, body, notice.running)
}

/** Take it down, and with it the service. Called when a session is finished or discarded. */
export async function clearTimerNotification(): Promise<void> {
  if (Platform.OS !== 'android') return
  stopService()
}

/** Android's own view of whether the service is up. Used by the device checks. */
export function timerServiceRunning(): boolean {
  return serviceIsRunning()
}

/**
 * Listen for the notification's buttons.
 *
 * Native, because they have to work when no screen is mounted and the app is not in front —
 * which is the entire reason the notification exists.
 */
export function onTimerAction(listener: (action: ReadingServiceAction) => void): {
  remove: () => void
} {
  return addActionListener(listener)
}

/**
 * Kept as a no-op so callers do not have to branch.
 *
 * The channel and the two action sets are created by the service now, because the service is
 * what posts the notification. There is nothing left to configure from JavaScript.
 */
export async function configureTimerNotifications(): Promise<void> {
  return undefined
}
