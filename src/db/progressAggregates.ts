/**
 * src/db/progressAggregates.ts
 *
 * HOW A READ'S PROGRESS IS AGGREGATED IN SQL, in one place.
 *
 * The Library list and book detail both need it, and features may not import from one
 * another (CLAUDE.md rule 9), so it lives in `db/` with the schema it reads. Both
 * `queries.ts` files import these fragments; neither writes its own.
 *
 * ─── THIS IS A SECOND EXPRESSION OF domain/stats.ts, ON PURPOSE ───────────────
 *
 * `contribution()` decides how one session counts: a timed session contributes its
 * duration, an audiobook logged by hand its minute span, a page session its positions, and
 * a backwards or half-filled session nothing. That rule is in TypeScript because it is
 * testable there, and here in SQL because the alternative is loading every session of every
 * book to draw one progress bar.
 *
 * Two expressions of one rule is how this codebase has been bitten repeatedly, so
 * **device check 10 samples real reads and asserts the two agree**. Change one and that
 * check fails until you change the other. Do not add a third.
 */

import { sql } from 'drizzle-orm'

import { sessions } from './schema'

/**
 * A countable position span: both ends present, and not backwards. The same test as
 * `sessionAmount()` in domain/progress.ts.
 */
const SPAN = sql`(
  ${sessions.fromPosition} is not null
  and ${sessions.toPosition} is not null
  and ${sessions.toPosition} >= ${sessions.fromPosition}
)`

/** A duration we are willing to believe: present and not negative. */
const HAS_DURATION = sql`(${sessions.durationSeconds} is not null and ${sessions.durationSeconds} >= 0)`

/**
 * Group by the read. Every fragment tolerates a LEFT JOIN with no sessions at all, which
 * is most of a real library.
 */
export const progressAggregates = {
  /** Furthest page reached, or null when no page session says. Never 0: see progress.ts. */
  page: sql<
    number | null
  >`max(case when ${sessions.format} = 'pages' then ${sessions.toPosition} end)`,
  /** Furthest minute reached, for an audiobook. */
  minute: sql<
    number | null
  >`max(case when ${sessions.format} = 'minutes' then ${sessions.toPosition} end)`,
  pagesRead: sql<number>`coalesce(sum(case when ${sessions.format} = 'pages' and ${SPAN}
    then ${sessions.toPosition} - ${sessions.fromPosition} else 0 end), 0)`,
  minutesRead: sql<number>`coalesce(sum(
    case
      when ${HAS_DURATION} then ${sessions.durationSeconds} / 60.0
      when ${sessions.format} = 'minutes' and ${SPAN} then ${sessions.toPosition} - ${sessions.fromPosition}
      else 0
    end), 0)`,
  /** Sessions the reader can fix: positions given but uncountable, or no measure at all. */
  unusable: sql<number>`coalesce(sum(case
      when ${sessions.id} is null then 0
      when (${sessions.fromPosition} is not null or ${sessions.toPosition} is not null) and not ${SPAN} then 1
      when ${sessions.fromPosition} is null and ${sessions.toPosition} is null and not ${HAS_DURATION} then 1
      else 0
    end), 0)`,
  sessionCount: sql<number>`count(${sessions.id})`,
  /** When the read began, when the reader has not said: 03-DATA-MODEL, `reads`. */
  firstSessionAt: sql<number | null>`min(${sessions.occurredAt})`,
  lastSessionAt: sql<number | null>`max(${sessions.occurredAt})`,
} as const
