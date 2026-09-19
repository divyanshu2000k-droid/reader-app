/**
 * src/ui/timerNotice.ts
 *
 * WHAT THE TIMER NOTIFICATION SAYS, and the identifiers its buttons send back.
 *
 * Pure: no React Native, no native module, nothing to await. Its own file because
 * `timerNotification.ts` imports `react-native` and `modules/reading-service`, and a node
 * test that reaches either dies before it gets to the assertion.
 *
 * ─── THESE STRINGS EXIST TWICE ───────────────────────────────────────────────
 *
 * `ReadingService.kt` puts one of the action strings into each `PendingIntent`, and the
 * TypeScript compares what comes back against `TIMER_ACTION`. Kotlin cannot import
 * TypeScript, so they are duplicated on purpose and held equal by
 * `__tests__/timerNotification.test.ts`. A rename on either side leaves a button that is
 * present, tappable and inert — which is what Finish was for a day.
 */

import { formatClock } from '@/domain/timerState'

/** One channel, so the reader can silence the timer without silencing everything. */
export const TIMER_CHANNEL = 'reading-timer'

/** Identifiers the notification's buttons send back. Mirrored in `ReadingService.kt`. */
export const TIMER_ACTION = {
  pause: 'timer-pause',
  resume: 'timer-resume',
  finish: 'timer-finish',
} as const

export interface TimerNotice {
  readonly title: string
  readonly seconds: number
  readonly running: boolean
}

/**
 * The two lines the reader sees.
 *
 * "12:04 so far" rather than a bare clock: a static number that looks like a clock reads as
 * a stopped timer, and this one is deliberately not live — it is written when the timer
 * starts, pauses or resumes and at no other time, because a notification updated every
 * second is a wakeup every second for a number nobody is looking at.
 */
export function noticeText(notice: TimerNotice): { title: string; body: string } {
  const elapsed = formatClock(notice.seconds)
  return {
    title: notice.running ? 'Reading' : 'Paused',
    body: notice.running
      ? `${notice.title} · ${elapsed} so far`
      : `${notice.title} · paused at ${elapsed}`,
  }
}
