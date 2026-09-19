/**
 * src/domain/timerState.ts
 *
 * WHAT A RUNNING TIMER IS, AND HOW LONG IT HAS RUN. Pure, because every competitor bug this
 * product exists to avoid is a wrong number, and a timer is a machine for producing numbers.
 *
 * In `domain/` rather than in `features/timer` because TWO features need it: the timer runs
 * the session, and the launch recovery gate works out how long a crashed one ran. It moved
 * here on 2026-09-18, when the heartbeat turned out to be written by the timer and read by
 * nobody — the gate was still computing `now - occurred_at` and the tighter bound the whole
 * mechanism exists for was never reaching the reader.
 *
 * ─── THE TIMER NEVER COUNTS WALL TIME ────────────────────────────────────────
 *
 * There is no ticking counter held in memory and incremented. The elapsed time is always
 * DERIVED from timestamps, because the thing that increments a counter is the JavaScript
 * thread, and on Android that thread stops when the screen goes off, when the app is
 * backgrounded, and when the OS decides it has had enough. A counter would silently under-
 * count exactly when the reader is doing the thing being measured: reading, not looking at
 * the app.
 *
 * So a session is a list of segments. Each segment has a start and, once paused, an end. The
 * elapsed time is the sum of the finished segments plus, if running, `now - startedAt` of the
 * open one. That is correct whether the process lived through it or not.
 *
 * ─── AND IT NEVER TRUSTS THE CLOCK TO MOVE FORWARD ───────────────────────────
 *
 * A device clock can move backwards: a manual change, a timezone-aware NTP correction, a dual
 * SIM handing over. `now - startedAt` can therefore be negative, and a negative duration is a
 * number nobody can explain. Every span here is clamped at zero, and `elapsedSeconds` never
 * decreases across calls with a monotonic `now`.
 */

/** A stretch of actual reading. `endedAt` null means it is the one still running. */
export interface Segment {
  readonly startedAt: number
  readonly endedAt: number | null
}

export type TimerStatus = 'running' | 'paused'

export interface TimerSession {
  readonly sessionId: string
  readonly readId: string
  readonly bookId: string
  /** Oldest first. At most one may have a null `endedAt`, and it must be the last. */
  readonly segments: readonly Segment[]
}

/** A span that cannot be negative however the clock behaved. */
function span(from: number, to: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, to - from)
}

export function status(session: TimerSession): TimerStatus {
  const last = session.segments[session.segments.length - 1]
  return last !== undefined && last.endedAt === null ? 'running' : 'paused'
}

/**
 * Whole seconds of actual reading: finished segments, plus the open one up to `now`.
 *
 * Paused time is not reading and is not counted. That is the whole reason segments exist
 * rather than a single `startedAt`.
 */
export function elapsedSeconds(session: TimerSession, now: number): number {
  let total = 0
  for (const s of session.segments) {
    total += span(s.startedAt, s.endedAt ?? now)
  }
  return Math.floor(total / 1000)
}

/** When the session began: the first segment's start. Null for a session with none. */
export function startedAt(session: TimerSession): number | null {
  return session.segments[0]?.startedAt ?? null
}

// ─── TRANSITIONS ─────────────────────────────────────────────────────────────
// Each returns the new segment list, or null when the transition does not apply. Null
// rather than a throw: a double tap on Pause is not an error, it is the second tap.

export function start(now: number): readonly Segment[] {
  return [{ startedAt: now, endedAt: null }]
}

export function pause(session: TimerSession, now: number): readonly Segment[] | null {
  if (status(session) !== 'running') return null
  const segments = session.segments.slice()
  const last = segments[segments.length - 1]
  if (last === undefined) return null
  // `now` before the segment started (a backwards clock) closes it at zero length rather
  // than producing a segment that runs backwards.
  segments[segments.length - 1] = {
    startedAt: last.startedAt,
    endedAt: Math.max(last.startedAt, now),
  }
  return segments
}

export function resume(session: TimerSession, now: number): readonly Segment[] | null {
  if (status(session) === 'running') return null
  return [...session.segments, { startedAt: now, endedAt: null }]
}

/**
 * Close the session for saving. Always returns a list with nothing left open, so the
 * duration written is final and cannot depend on when it is later read.
 */
export function stop(session: TimerSession, now: number): readonly Segment[] {
  return pause(session, now) ?? session.segments
}

// ─── WHAT THE SCREEN AND THE NOTIFICATION SAY ────────────────────────────────

/**
 * `MM:SS` under an hour, `H:MM:SS` past it. The artboard shows `04:12`.
 *
 * Not `lib/dates.ts`'s `formatDuration`, which says "1h 12m" — right for a session row in a
 * list, wrong for a clock the reader is watching tick. A running timer needs seconds.
 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * How far round the ring to draw, 0 to 1.
 *
 * **The ring is not progress toward a goal**, because a reading session has no target length
 * and inventing one would be the app telling the reader how long to read. It is a one-hour
 * sweep that fills and then stays full: a shape that shows time passing, not a bar that shames
 * you for stopping. Past an hour it holds at 1 rather than wrapping, because a ring that
 * resets looks like the timer did.
 */
export const RING_SWEEP_SECONDS = 3600

export function ringFraction(totalSeconds: number): number {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 0
  return Math.min(1, totalSeconds / RING_SWEEP_SECONDS)
}
