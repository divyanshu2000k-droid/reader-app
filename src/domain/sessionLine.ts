/**
 * src/domain/sessionLine.ts
 *
 * WHAT ONE SESSION ROW SAYS. Pure, so every shape of session is asserted rather than seen
 * on whichever one happened to be seeded.
 *
 * Follows the owner's counting rule (DECISIONS.md, 2026-09-10) and positions-as-boundaries
 * (03-DATA-MODEL): `0 → 10` is ten pages, a recovered session is time and not pages, and a
 * session that cannot be counted SAYS so rather than showing zero.
 *
 * In domain/ since Slice 3: book detail's session rows and Recently Deleted's deleted sessions
 * describe a session the same way, and features may not import from one another.
 */

import { formatDuration } from '@/lib/dates'

export interface SessionShape {
  readonly format: 'pages' | 'minutes'
  readonly fromPosition: number | null
  readonly toPosition: number | null
  readonly durationSeconds: number | null
}

export interface SessionLine {
  /** The headline: what was read. */
  readonly amount: string
  /** How long it took, when that is known and not already the headline. */
  readonly duration: string | null
  /** True when the reader should fix this session: it counts toward nothing. */
  readonly needsFix: boolean
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function sessionLine(s: SessionShape): SessionLine {
  const from = s.fromPosition
  const to = s.toPosition
  const duration =
    s.durationSeconds !== null && s.durationSeconds >= 0
      ? formatDuration(s.durationSeconds)
      : null
  const unit = s.format === 'pages' ? 'page' : 'minute'

  if (from !== null && to !== null) {
    if (to < from) {
      return {
        amount: `${unit === 'page' ? 'Page' : 'Minute'} ${from} → ${to}, backwards`,
        duration,
        needsFix: true,
      }
    }
    const span = to - from
    const amount =
      s.format === 'pages'
        ? `${plural(span, 'page', 'pages')} · ${from} → ${to}`
        : `${formatDuration(span * 60)} listened · ${from} → ${to}`
    return { amount, duration, needsFix: false }
  }

  if (from !== null || to !== null) {
    const known = from ?? to
    return {
      amount: from !== null ? `From ${unit} ${known}, no end` : `To ${unit} ${known}, no start`,
      duration,
      needsFix: true,
    }
  }

  // No positions. A duration alone is real reading: a recovered session, or a timer the
  // reader stopped without saying where they got to. Time, and nothing to fix.
  if (duration !== null) return { amount: `${duration} read`, duration: null, needsFix: false }

  return { amount: 'Nothing recorded', duration: null, needsFix: true }
}
