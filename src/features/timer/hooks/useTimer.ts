/**
 * src/features/timer/hooks/useTimer.ts
 *
 * A VIEW onto the running timer. It owns nothing.
 *
 * The tick, the heartbeat, the notification and its buttons all live in `timerService.ts`,
 * which is a module and therefore outlives this screen. This hook subscribes, re-renders, and
 * forwards intents.
 *
 * **It used to own all four**, which meant leaving the timer screen silently stopped the
 * heartbeat, froze the notification and unregistered its Pause button — while the session
 * stayed open. See `docs/10-AUDIT-2026-09-18.md`, finding 1. The point of the rewrite is that
 * unmounting this hook now costs nothing.
 *
 * It owned one more thing until 2026-09-19: the `AppState` listener that beats just before
 * the app is backgrounded. Being here meant it only fired for a reader who was still LOOKING
 * at the timer, and reading with a timer running means leaving this screen. It is in the
 * service now, for the same reason as the other four.
 */

import { useCallback, useSyncExternalStore } from 'react'

import {
  currentSeconds,
  discard as discardTimer,
  finish as finishTimer,
  getTimerSnapshot,
  pause as pauseTimer,
  resume as resumeTimer,
  subscribeTimer,
  type TimerSnapshot,
} from '../timerService'
import type { Result } from '@/lib/result'

export interface Timer {
  readonly snapshot: TimerSnapshot | null
  readonly seconds: number
  readonly running: boolean
  readonly pause: () => void
  readonly resume: () => void
  readonly finish: (toPosition: number | null) => Promise<Result<unknown>>
  readonly discard: () => Promise<string | null>
}

export function useTimer(): Timer {
  const snapshot = useSyncExternalStore(subscribeTimer, getTimerSnapshot, getTimerSnapshot)

  const finish = useCallback((toPosition: number | null) => finishTimer(toPosition), [])
  const discard = useCallback(() => discardTimer(), [])

  return {
    snapshot,
    // Read through the service, so the number is derived at render time and never stored.
    seconds: currentSeconds(),
    running: snapshot?.status === 'running',
    pause: pauseTimer,
    resume: resumeTimer,
    finish,
    discard,
  }
}
