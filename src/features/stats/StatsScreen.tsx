/**
 * Stats, as Slice 3 ships it: the daily pace chart for the last fourteen days, by the reader's
 * local day, with pages and time as separate charts. Slice 7 builds the rest of `Stats.dc.html`
 * around it.
 *
 * Reloads on return, so a session logged or re-dated elsewhere moves its bar here.
 */

import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { PACE_DAYS, paceChart, type PaceMetric } from './paceChart'
import { getSessionsSince } from './queries'
import type { ProgressSession } from '@/domain/progress'
import { dailyTotals } from '@/domain/stats'
import {
  addDays,
  formatDuration,
  formatLocalDay,
  todayLocalDay,
  weekdayInitial,
} from '@/lib/dates'
import { appError, type AppError } from '@/lib/result'
import { empty, nav } from '@/lib/strings'
import { EmptyState } from '@/ui/EmptyState'
import { Header } from '@/ui/Header'
import { InlineError } from '@/ui/InlineError'
import { Screen } from '@/ui/Screen'
import { Segmented } from '@/ui/Segmented'
import { SkeletonGate } from '@/ui/Skeleton'
import { font, radius, rules, size, space, typeStyle } from '@/ui/theme'
import { useOnRefocus } from '@/ui/useOnRefocus'
import { useColors } from '@/ui/useTheme'

const METRICS = [
  { value: 'pages', label: 'Pages' },
  { value: 'minutes', label: 'Time' },
] as const satisfies readonly { value: PaceMetric; label: string }[]

function amount(metric: PaceMetric, value: number): string {
  if (metric === 'minutes')
    return value === 0 ? 'no time' : formatDuration(Math.round(value * 60))
  return `${value} ${value === 1 ? 'page' : 'pages'}`
}

export function StatsScreen() {
  const c = useColors()
  const [rows, setRows] = useState<ProgressSession[] | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [metric, setMetric] = useState<PaceMetric>('pages')
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const today = todayLocalDay()

  useEffect(() => {
    let cancelled = false
    void getSessionsSince(addDays(today, -(PACE_DAYS - 1)))
      .then((next) => {
        if (cancelled) return
        setRows(next)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(
          appError('recoverable', 'Could not read your sessions', {
            safe: 'Nothing was changed.',
            cause,
          }),
        )
      })
    return () => {
      cancelled = true
    }
  }, [today, nonce])
  useOnRefocus(reload)

  const chart = rows === null ? null : paceChart(dailyTotals(rows), today, metric)

  return (
    <Screen>
      <Header title={nav.stats.title} />
      {error ? <InlineError error={error} onRetry={reload} /> : null}
      <SkeletonGate loading={rows === null && error === null} fallback={null}>
        {/* No session at all in the window: the stats empty state, which promises nothing locked. */}
        {rows !== null && rows.length === 0 ? (
          <EmptyState title={empty.stats.title} body={empty.stats.body} />
        ) : chart ? (
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text
                accessibilityRole="header"
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.heading), { color: c.text }]}
              >
                Daily pace
              </Text>
              <Text
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.secondary), { color: c.textMuted }]}
              >
                {`Last ${PACE_DAYS} days · ${amount(metric, chart.total)}`}
              </Text>
            </View>
            <Segmented
              accessibilityLabel="Pages or time"
              options={METRICS}
              value={metric}
              onChange={setMetric}
            />
            <View style={styles.chart}>
              {chart.bars.map((bar) => (
                <View
                  key={bar.day}
                  accessible
                  accessibilityLabel={`${formatLocalDay(bar.day)}, ${amount(metric, bar.value)}`}
                  style={styles.column}
                >
                  <View style={[styles.plot, { backgroundColor: c.surface }]}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${Math.round(bar.fraction * 100)}%`,
                          minHeight: bar.value > 0 ? size.paceBarMin : 0,
                          backgroundColor: bar.isToday ? c.accentInk : c.textFaint,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    maxFontSizeMultiplier={rules.maxFontScale}
                    style={[
                      typeStyle(font.caption),
                      { color: bar.isToday ? c.text : c.textMuted },
                    ]}
                  >
                    {weekdayInitial(bar.day)}
                  </Text>
                </View>
              ))}
            </View>
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.secondary), { color: c.textMuted }]}
            >
              {chart.empty
                ? metric === 'pages'
                  ? 'No pages logged in the last two weeks.'
                  : 'No time logged in the last two weeks.'
                : 'Each bar is the day you read, as you lived it. Change a session’s date and its bar moves.'}
            </Text>
          </View>
        ) : null}
      </SkeletonGate>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { gap: space.section },
  titleRow: { gap: space.labelGap },
  chart: { flexDirection: 'row', gap: space.segmentPad, alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center', gap: space.labelGap },
  plot: {
    alignSelf: 'stretch',
    height: size.paceChart,
    justifyContent: 'flex-end',
    borderRadius: radius.skeleton,
    overflow: 'hidden',
  },
  bar: { alignSelf: 'stretch', borderRadius: radius.skeleton },
})
