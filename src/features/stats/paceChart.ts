/**
 * src/features/stats/paceChart.ts
 *
 * WHAT THE DAILY PACE CHART DRAWS. Pure, so the bars are asserted rather than eyeballed.
 *
 * Slice 3's "done when" is a correct daily pace chart for a session logged last Tuesday: the
 * bar must stand on Tuesday, by the reader's local day, and move when the session's date is
 * edited. This is that chart and nothing more. Slice 7 builds Stats around it: the three
 * numbers, genres, the year switcher.
 *
 * - **Pages and time are two charts, never one** (domain/stats.ts). A toggle picks which.
 * - **Every day gets a bar**, zero included (`lastDays`), so a gap looks like a gap.
 * - **Heights are relative to the busiest day shown**, and a day with any reading is never
 *   drawn as nothing, however small beside the biggest.
 */

import { lastDays, type DayTotals } from '@/domain/stats'
import type { LocalDay } from '@/lib/dates'

export const PACE_DAYS = 14

export type PaceMetric = 'pages' | 'minutes'

export interface PaceBar {
  readonly day: LocalDay
  readonly value: number
  /** 0 to 1 of the plot height. */
  readonly fraction: number
  readonly isToday: boolean
}

export interface PaceChart {
  readonly bars: readonly PaceBar[]
  /** The window's total for this metric. */
  readonly total: number
  /** True when nothing at all was read in the window. */
  readonly empty: boolean
}

export function paceChart(
  days: readonly DayTotals[],
  today: LocalDay,
  metric: PaceMetric,
  count: number = PACE_DAYS,
): PaceChart {
  const window = lastDays(days, today, count)
  const values = window.map((d) => (metric === 'pages' ? d.pages : d.minutes))
  const max = Math.max(0, ...values)
  const total = values.reduce((a, b) => a + b, 0)
  return {
    bars: window.map((d, i) => {
      const value = values[i] ?? 0
      return {
        day: d.day,
        value,
        fraction: max === 0 ? 0 : value / max,
        isToday: d.day === today,
      }
    }),
    total,
    empty: total === 0,
  }
}
