/**
 * src/features/stats/queries.ts
 *
 * All SQL for Stats. In Slice 3 that is the daily pace chart's sessions; Slice 7 adds the rest.
 *
 * The sessions are loaded and counted in TypeScript by `contribution()`, not summed in SQL.
 * Fourteen days of sessions is a few dozen rows, and a second SQL copy of the counting rule
 * is exactly what device check 10 exists to police for the Library (db/progressAggregates.ts).
 * Do not add a third copy for one chart.
 */

import { and, gte, isNull } from 'drizzle-orm'

import { getDb } from '@/db/client'
import { sessions } from '@/db/schema'
import type { ProgressSession } from '@/domain/progress'
import type { LocalDay } from '@/lib/dates'

/**
 * Every live session on or after a local day. Filters on `local_day`, the reader's calendar
 * day, never on `occurred_at` against a UTC boundary (03-DATA-MODEL). `YYYY-MM-DD` sorts as
 * text, and `idx_sessions_day` carries the filter.
 */
export async function getSessionsSince(day: LocalDay): Promise<ProgressSession[]> {
  return getDb()
    .select({
      format: sessions.format,
      fromPosition: sessions.fromPosition,
      toPosition: sessions.toPosition,
      durationSeconds: sessions.durationSeconds,
      occurredAt: sessions.occurredAt,
      localDay: sessions.localDay,
    })
    .from(sessions)
    .where(and(isNull(sessions.deletedAt), gte(sessions.localDay, day)))
}
