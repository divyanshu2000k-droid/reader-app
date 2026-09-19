/**
 * src/domain/timerRun.ts
 *
 * A RUNNING TIMER'S STATE, AND THE HEARTBEAT THAT BOUNDS A CRASH. Pure.
 *
 * ─── WHERE A RUNNING TIMER LIVES, AND WHY IT IS NOT IN `sessions` ────────────
 *
 * The `sessions` row is created the moment Start is tapped, so a crash cannot lose the fact
 * that reading happened (04-SCREENS). But the SEGMENTS — pause, resume, pause — are not
 * library data. They are device state about a timer in progress, and they change every time
 * the reader taps Pause.
 *
 * They live in `metadata_cache`, local-only, exactly like a note draft (Slice 5b). Two
 * reasons, and the second is the one that matters:
 *
 *   1. They mean nothing on another device. A timer running on a phone is not running on a
 *      tablet, and syncing "paused at 14:03" would be syncing a fact about a machine.
 *   2. **A heartbeat every 30 seconds through `write.ts` would append a `sync_queue` row
 *      every 30 seconds.** An hour's reading would queue 120 rows describing a timer nobody
 *      else will ever see, and the drain would spend a reader's battery pushing them. The
 *      queue is for the reader's library, not for telemetry about it.
 *
 * ─── WHAT THE HEARTBEAT IS FOR ───────────────────────────────────────────────
 *
 * `features/launch/recoveryPolicy.ts` has said since Slice 1 that a recovered session's
 * duration is bounded by `now - startedAt`, and that "when Slice 6's timer records a
 * heartbeat, the bound tightens to the last heartbeat". This is that heartbeat.
 *
 * A session killed at 23:00 and reopened at 08:00 has an elapsed time of nine hours, and the
 * reader is asked to type a number because nine hours is not a reading measurement, it is a
 * measurement of how long the app was shut. With a heartbeat written every 30 seconds while
 * the timer runs, the app knows it was alive at 22:58 — so the upper bound is what had
 * elapsed by then, not by 08:00. The reader STILL confirms: a heartbeat proves the app was
 * running, never that the reader was reading.
 */

import { RUN_SOURCE } from '@/db/localRecords'
import type { Segment } from './timerState'

// Re-exported so this feature's own modules read it from here, while `features/launch` —
// which must clear a crashed run without importing the timer — reads it from `db/`.
export { RUN_SOURCE }

/**
 * How often the heartbeat is written while the timer runs.
 *
 * Thirty seconds: close enough that a crash costs at most half a minute of the bound, cheap
 * enough that an hour of reading is 120 tiny local writes and no sync rows at all.
 */
export const HEARTBEAT_MS = 30_000

export interface TimerRun {
  readonly sessionId: string
  readonly readId: string
  readonly bookId: string
  readonly segments: readonly Segment[]
  /** When the app last proved it was alive. Null before the first beat. */
  readonly lastBeatAt: number | null
}

export function encodeRun(run: TimerRun): string {
  return JSON.stringify(run)
}

function isSegment(v: unknown): v is Segment {
  if (typeof v !== 'object' || v === null) return false
  const { startedAt, endedAt } = v as Record<string, unknown>
  return typeof startedAt === 'number' && (endedAt === null || typeof endedAt === 'number')
}

/**
 * A stored payload back into a run, or null if it is not one.
 *
 * Validated field by field: this came off disk and may have been written by an older build.
 * A corrupt payload must not be able to stop the app launching — the session row itself is
 * still there, and recovery falls back to the wider `now - startedAt` bound.
 */
export function decodeRun(payload: string): TimerRun | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { sessionId, readId, bookId, segments, lastBeatAt } = parsed as Record<string, unknown>
  if (typeof sessionId !== 'string' || typeof readId !== 'string') return null
  if (typeof bookId !== 'string') return null
  if (!Array.isArray(segments) || !segments.every(isSegment)) return null
  if (lastBeatAt !== null && typeof lastBeatAt !== 'number') return null
  return { sessionId, readId, bookId, segments, lastBeatAt }
}

/**
 * The instant a recovered session's elapsed time should be measured to.
 *
 * The last heartbeat when there is one, because that is the last moment the app is KNOWN to
 * have been alive. `now` only when there is none — a session started and killed before the
 * first beat, which is at most `HEARTBEAT_MS` of reading anyway.
 *
 * Never later than `now`: a heartbeat from the future is a clock that moved backwards, and
 * trusting it would hand the reader a duration longer than the session could possibly be.
 */
export function recoveryBoundAt(
  run: TimerRun | null,
  now: number,
  /**
   * The native heartbeat, or 0 for none.
   *
   * There are TWO heartbeats, and this is the one that usually matters. The JavaScript one
   * stops the instant the app is backgrounded — React Native's timers are driven by frame
   * callbacks and a backgrounded app draws no frames — which is exactly the situation a
   * heartbeat exists for. Measured on a phone on 2026-09-19: 2 beats in 75 seconds in the
   * foreground, **0** in the next 75 backgrounded, **0** in six minutes of doze. So for the
   * whole of Slice 6 the bound was frozen at the moment the reader last looked at the app,
   * and a reader killed after an hour in a pocket would have been offered seconds.
   *
   * The later of the two is taken because each is a moment the app is KNOWN to have been
   * alive, and knowing it was alive later is strictly better information.
   */
  nativeBeatAt = 0,
): number {
  const stored = run !== null && Number.isFinite(run.lastBeatAt) ? (run.lastBeatAt ?? 0) : 0
  const native = Number.isFinite(nativeBeatAt) ? nativeBeatAt : 0
  const known = Math.max(stored, native)
  if (known <= 0) return now
  return Math.min(known, now)
}

/**
 * Whether the heartbeat is due. Called on a tick; cheap and total.
 *
 * A `lastBeatAt` in the future (backwards clock) is due immediately rather than never, which
 * is the failure mode of a naive `now - lastBeatAt >= HEARTBEAT_MS`.
 */
export function heartbeatDue(run: TimerRun, now: number): boolean {
  if (run.lastBeatAt === null || !Number.isFinite(run.lastBeatAt)) return true
  if (run.lastBeatAt > now) return true
  return now - run.lastBeatAt >= HEARTBEAT_MS
}
