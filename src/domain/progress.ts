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
 * The furthest position reached, for one format.
 *
 * Scoped to a single read's sessions by the caller. A re-read starts from zero because
 * it is a different `reads` row with its own sessions, which is the whole point of the
 * three-table model.
 */
export function currentPosition(
  sessions: readonly ProgressSession[],
  format: SessionFormat,
): number {
  let max = 0
  for (const s of sessions) {
    if (s.format !== format) continue
    if (s.toPosition !== null && s.toPosition > max) max = s.toPosition
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

/** Units covered by one session. Zero when either end is unknown. */
export function sessionAmount(session: ProgressSession): number {
  if (session.fromPosition === null || session.toPosition === null) return 0
  const delta = session.toPosition - session.fromPosition
  return delta > 0 ? delta : 0
}
