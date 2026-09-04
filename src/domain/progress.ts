/**
 * src/domain/progress.ts
 *
 * Current position and percent complete. Needed by the session logger, book detail and
 * stats, which is why it lives in domain/ rather than inside one feature.
 *
 * Nothing here is stored. Storing derived values means they drift.
 */

import type { LocalDay, UnixMs } from '@/lib/dates'
import type { SessionFormat } from '@/db/schema'

/** The minimum a session must expose for progress maths. */
export interface ProgressSession {
  readonly format: SessionFormat
  readonly fromPosition: number | null
  readonly toPosition: number | null
  readonly occurredAt: UnixMs
  readonly localDay: LocalDay
}

/**
 * The furthest position reached, for one format, or null when nothing says.
 *
 * NULL RATHER THAN ZERO, for the same reason `percentComplete` returns null: they are
 * different facts and the UI shows them differently. This used to return 0 for a read
 * with only audiobook sessions when asked for pages, which is indistinguishable from
 * "on page 0" — so the book detail screen would confidently print "page 0 of 502" for a
 * book the reader is ten hours into.
 *
 * Scoped to a single read's sessions by the caller. A re-read starts from nothing
 * because it is a different `reads` row with its own sessions, which is the whole point
 * of the three-table model.
 */
export function currentPosition(
  sessions: readonly ProgressSession[],
  format: SessionFormat,
): number | null {
  let max: number | null = null
  for (const s of sessions) {
    if (s.format !== format) continue
    if (s.toPosition !== null && (max === null || s.toPosition > max)) max = s.toPosition
  }
  return max
}

/**
 * Percent complete, 0 to 1, or null when it cannot honestly be computed.
 *
 * Returns null rather than 0 when the total is missing, so the UI can fall back to
 * showing a raw page number instead of a progress bar that reads as "no progress".
 * Missing page counts are the median case, not an edge case.
 *
 * Clamped to 1. API page counts are frequently wrong and a reader who passes the
 * supposed last page should see a full bar, not 108%.
 */
export function percentComplete(position: number, total: number | null): number | null {
  if (total === null || total <= 0) return null
  if (position <= 0) return 0
  return Math.min(position / total, 1)
}

/**
 * True when a session claims a position beyond the book's recorded length.
 *
 * This is not an error. The page count is usually the thing that is wrong, so the UI
 * offers to correct the book rather than rejecting the session. Never block a save on
 * this.
 */
export function exceedsKnownLength(position: number, total: number | null): boolean {
  return total !== null && total > 0 && position > total
}

/**
 * True when a session ends before it starts — page 120 to page 40.
 *
 * Almost always a typo, occasionally a reader logging a re-read of an earlier chapter.
 * Either way the app cannot know what it means, so it says so rather than guessing.
 */
export function isBackwards(session: ProgressSession): boolean {
  return (
    session.fromPosition !== null &&
    session.toPosition !== null &&
    session.toPosition < session.fromPosition
  )
}

/**
 * Units covered by one session, or NULL when that cannot honestly be computed: either
 * end unknown, or the session runs backwards.
 *
 * This used to clamp both cases to 0 and carry on. A session typed as 120 to 40 then
 * contributed nothing to any total, with no error, no flag and no way for the reader to
 * find out — their pages number was simply wrong and unexplainable. Silently discarding
 * a row the reader deliberately created is the worst of the three options; the other two
 * are counting it wrong and saying so. This says so.
 *
 * Every caller must decide what to do with null. `totals` counts them as `unusable`.
 */
export function sessionAmount(session: ProgressSession): number | null {
  if (session.fromPosition === null || session.toPosition === null) return null
  if (isBackwards(session)) return null
  return session.toPosition - session.fromPosition
}
