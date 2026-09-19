/**
 * src/features/launch/recoveryPolicy.ts
 *
 * What a recovered session is allowed to claim about how long the reader read. Pure, so
 * the rule is asserted under `node --test` rather than argued in a comment.
 *
 * ─── THE ONLY HONEST ANSWER IS "WE DON'T KNOW" ───────────────────────────────
 *
 * A timed session that is still open at launch tells us exactly one thing: when it
 * started. It does not tell us when the reader stopped. The app died at some unknown
 * moment between the start and now — the reader may have read for ten minutes, put the
 * phone down, and opened the app again the next morning.
 *
 * The first version of the recovery sheet saved `now - startedAt` without asking. A session
 * killed at 23:00 and reopened at 08:00 saved nine hours of reading, straight into the
 * statistics that are the product's core metric. That is a fabricated number, and it is
 * the precise failure competitors are reviewed badly for. So:
 *
 *   - The elapsed time is only an UPPER BOUND. Nobody can have read longer than it.
 *   - Within a sane cap it is OFFERED as a starting value the reader can change.
 *   - Beyond the cap it is not offered at all: the field starts empty and the reader
 *     types what they actually read. At that distance the elapsed time is not a guess
 *     about reading, it is a measurement of how long the app was closed.
 *   - The app never writes a duration the reader has not seen and accepted.
 *
 * ─── TWO NUMBERS, NOT ONE, SINCE 2026-09-19 ─────────────────────────────────
 *
 * Slice 6's heartbeat tightened the bound, and in doing so quietly broke the sentence above
 * that everything here rests on: "nobody can have read longer than it".
 *
 * That is true of `now - occurredAt`, which is wall clock and a real physical limit. It is
 * NOT true of the heartbeat, which is the last moment the APP was known to be alive. A
 * reader can easily read for longer than that — they do it every time the phone stops the
 * app while they carry on reading. Measured on a phone on 2026-09-19: with "restrict
 * background usage" set, Android killed the foreground service about 47 seconds in, and a
 * five-minute session was capped at ONE MINUTE with no way for the reader to say otherwise.
 * The error message even told them "It started 1 minute ago", which was false.
 *
 * So the two roles are separated:
 *
 *   - **`maxMinutes` is the wall clock since the session started.** A genuine upper bound,
 *     and the only thing the reader may not exceed, because they cannot have read for longer
 *     than the session has existed.
 *   - **`suggestedMinutes` is the heartbeat bound**, which is the app's best honest guess and
 *     the value the field starts with.
 *
 * The app still never writes a number the reader has not seen and accepted. It just no
 * longer forbids them from stating the truth when the phone cut the timer short. **The
 * reader is the authority on how long they read; the app is only the authority on how long
 * it was running.**
 */

/**
 * Beyond this, the elapsed time is not offered as a starting value.
 *
 * Three hours: long enough to cover a genuinely long sitting, short enough that anything
 * past it is far more likely to be "the app was closed overnight" than "they read
 * continuously". The exact number matters less than the fact that past it, we ask.
 */
export const RECOVERY_PREFILL_CAP_MINUTES = 180

export interface RecoveryOffer {
  /**
   * Whole minutes since the session STARTED: the most the reader can have read.
   *
   * Wall clock, not the heartbeat. The reader cannot have read for longer than the session
   * has existed, and they very much can have read for longer than the app stayed alive.
   */
  readonly maxMinutes: number
  /** A starting value for the field, or null when too much time has passed to offer one. */
  readonly suggestedMinutes: number | null
  /**
   * True when the app stopped before the session did, so the suggestion is tighter than the
   * maximum. The sheet says something different in this case: the reader is the one who
   * knows whether they kept reading.
   */
  readonly stoppedEarly: boolean
}

export function recoveryOffer(
  /** The heartbeat bound: the last moment the app was known to be running. */
  elapsedSeconds: number,
  /**
   * Wall clock since the session started. Defaults to the heartbeat bound so an older caller
   * keeps the previous behaviour — but every real caller passes it, because without it a
   * reader whose phone stopped the timer cannot record what they actually read.
   */
  maxSeconds = elapsedSeconds,
): RecoveryOffer {
  // A clock that moved backwards while the app was dead, or a start time in the future,
  // produces a negative or non-finite elapsed time. Neither may become a duration.
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0
  const wall = Number.isFinite(maxSeconds) ? Math.max(0, maxSeconds) : 0
  // The heartbeat can never sensibly exceed the wall clock; if a clock moved it might.
  const bounded = Math.min(elapsed, wall)
  // At least one minute, so a session killed seconds after starting can still be kept.
  const maxMinutes = Math.max(1, Math.floor(wall / 60))
  const suggested = Math.max(1, Math.floor(bounded / 60))
  return {
    maxMinutes,
    suggestedMinutes: suggested <= RECOVERY_PREFILL_CAP_MINUTES ? suggested : null,
    stoppedEarly: suggested < maxMinutes,
  }
}

export type MinutesCheck =
  | { readonly ok: true; readonly minutes: number }
  | { readonly ok: false; readonly reason: 'empty' | 'notWhole' | 'tooShort' | 'tooLong' }

/** Validate what the reader typed. Whole minutes, at least one, no more than elapsed. */
export function checkMinutes(input: string, maxMinutes: number): MinutesCheck {
  const text = input.trim()
  if (text === '') return { ok: false, reason: 'empty' }
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'notWhole' }
  const minutes = Number(text)
  if (minutes < 1) return { ok: false, reason: 'tooShort' }
  if (minutes > maxMinutes) return { ok: false, reason: 'tooLong' }
  return { ok: true, minutes }
}
