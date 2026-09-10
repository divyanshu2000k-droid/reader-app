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
 * When the timer lands in Slice 6 it should record a heartbeat while running, which turns
 * the upper bound into a much tighter one. It still will not know when the reader stopped
 * reading, so the reader still confirms. See DECISIONS.md, 2026-09-10.
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
  /** Whole minutes since the session started: the most the reader can have read. */
  readonly maxMinutes: number
  /** A starting value for the field, or null when too much time has passed to offer one. */
  readonly suggestedMinutes: number | null
}

export function recoveryOffer(elapsedSeconds: number): RecoveryOffer {
  // A clock that moved backwards while the app was dead, or a start time in the future,
  // produces a negative or non-finite elapsed time. Neither may become a duration.
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0
  // At least one minute, so a session killed seconds after starting can still be kept.
  const maxMinutes = Math.max(1, Math.floor(elapsed / 60))
  return {
    maxMinutes,
    suggestedMinutes: maxMinutes <= RECOVERY_PREFILL_CAP_MINUTES ? maxMinutes : null,
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
