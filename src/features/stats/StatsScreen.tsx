/**
 * Stats: three numbers, a year switcher, the daily pace chart and the genre breakdown.
 *
 * ─── ONE LOAD, TWO TABLES, SO NOTHING CAN DISAGREE ───────────────────────────
 *
 * Sessions and finished reads are each fetched once, and every number on this screen is
 * derived from those two arrays. Fetching per section would let the books figure and the
 * genre chart beneath it be computed from two different notions of "finished in 2025" —
 * which is how a screen ends up saying "12 books" above a chart totalling 11, and the reader
 * is right to trust neither.
 *
 * ─── THE PACE CHART IS NOT YEAR-SCOPED, ON PURPOSE ───────────────────────────
 *
 * It is always the last fourteen days, whatever year is selected, and its heading says so.
 * "The last 14 days of 2019" is not a thing anyone wants; that chart answers "how am I doing
 * lately", and the year switcher governs the numbers that are about a year.
 *
 * Reloads on return, so a session logged or re-dated elsewhere moves its bar here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { GenreBreakdown } from './components/GenreBreakdown'
import { YearTotals } from './components/YearTotals'
import { PACE_DAYS, paceChart, type PaceMetric } from './paceChart'
import { getAllSessions, getFinishedReads, type FinishedReadWithGenre } from './queries'
import { isEmptyYear, yearSummary, yearsToOffer } from './yearSummary'
import { getGoals, type Goal } from '@/db/goals'
import { effectiveFinishedAt } from '@/domain/finishes'
import { goalLabel, goalProgress } from '@/domain/goal'
import { genreBreakdown } from '@/domain/genre'
import type { ProgressSession } from '@/domain/progress'
import { dailyTotals } from '@/domain/stats'
import {
  formatDuration,
  formatLocalDay,
  localYearOf,
  now,
  todayLocalDay,
  weekdayInitial,
} from '@/lib/dates'
import { appError, type AppError } from '@/lib/result'
import { empty, nav } from '@/lib/strings'
import { Chip } from '@/ui/Chip'
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

interface Loaded {
  readonly sessions: ProgressSession[]
  readonly finished: FinishedReadWithGenre[]
  readonly goals: Goal[]
}

export function StatsScreen() {
  const c = useColors()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [metric, setMetric] = useState<PaceMetric>('pages')
  const [year, setYear] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const today = todayLocalDay()

  useEffect(() => {
    let cancelled = false
    void Promise.all([getAllSessions(), getFinishedReads(), getGoals()])
      .then(([sessions, finished, goals]) => {
        if (cancelled) return
        setData({ sessions, finished, goals })
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
  }, [nonce])
  useOnRefocus(reload)

  const years = useMemo(
    () => (data === null ? [] : yearsToOffer(data.sessions, data.finished, localYearOf(now()))),
    [data],
  )
  /**
   * The selected year, or the newest one there is.
   *
   * Held as null until the reader picks, rather than defaulting into state on load: a stored
   * default would go stale the moment a session was logged in a year that did not exist when
   * the screen mounted, and the reader would be looking at a year the switcher no longer
   * offers.
   */
  const selected =
    year !== null && years.includes(year) ? year : (years[0] ?? localYearOf(now()))

  const summary = useMemo(
    () => (data === null ? null : yearSummary(data.sessions, data.finished, selected)),
    [data, selected],
  )

  /** Books FINISHED in the selected year, by genre — the same set the books number counts. */
  const tallies = useMemo(() => {
    if (data === null) return []
    const inYear = data.finished.filter((read) => {
      const at = effectiveFinishedAt(read)
      return at !== null && localYearOf(at) === selected
    })
    return genreBreakdown(inYear)
  }, [data, selected])

  const chart = data === null ? null : paceChart(dailyTotals(data.sessions), today, metric)

  /**
   * The goal for the SELECTED year, not for this one.
   *
   * A reader looking at 2024 wants to know whether they hit their 2024 goal. Showing the
   * current year's target above last year's count would compare two unrelated numbers and
   * present the result as progress.
   */
  const goal = useMemo(() => {
    if (data === null || summary === null) return null
    const target = data.goals.find((g) => g.year === selected)?.targetBooks ?? null
    return target === null ? null : goalProgress(target, summary.books)
  }, [data, summary, selected])

  /** Nothing at all, in any year: the only case that gets the empty state. */
  const nothingEver = data !== null && data.sessions.length === 0 && data.finished.length === 0

  return (
    <Screen above="tabBar">
      <Header title={nav.stats.title} />
      {error ? <InlineError error={error} onRetry={reload} /> : null}
      <SkeletonGate loading={data === null && error === null} fallback={null}>
        {nothingEver ? (
          <EmptyState title={empty.stats.title} body={empty.stats.body} />
        ) : summary !== null && chart !== null ? (
          /*
           * Scrolling: four sections is more than a phone shows at once, and more again at
           * 200% font. A ScrollView rather than a list, as `NoteEditorScreen` does, because
           * the content is a fixed handful of sections — not the hundreds of rows that made
           * book detail a FlashList.
           */
          <ScrollView style={styles.fill} contentContainerStyle={styles.body}>
            {/* ── the year switcher ── */}
            {years.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.years}
              >
                {years.map((option) => (
                  <Chip
                    key={option}
                    label={String(option)}
                    selected={option === selected}
                    accessibilityLabel={`Show ${option}`}
                    onPress={() => setYear(option)}
                  />
                ))}
              </ScrollView>
            ) : null}

            {/* ── the three numbers ── */}
            <View style={styles.section}>
              <YearTotals summary={summary} />
              <Text
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.secondary), { color: c.textMuted }]}
              >
                {isEmptyYear(summary)
                  ? `Nothing logged in ${selected} yet.`
                  : `Pages and hours are what you logged in ${selected}. Books are the ones you finished in it.`}
              </Text>
              {goal !== null ? (
                <View
                  accessible
                  accessibilityLabel={`Goal for ${selected}: ${goalLabel(goal)}`}
                  style={styles.goal}
                >
                  <View style={[styles.goalTrack, { backgroundColor: c.surface }]}>
                    <View
                      style={[
                        styles.goalFill,
                        {
                          width: `${Math.round(goal.fraction * 100)}%`,
                          backgroundColor: goal.met ? c.accentInk : c.textFaint,
                        },
                      ]}
                    />
                  </View>
                  <Text
                    maxFontSizeMultiplier={rules.maxFontScale}
                    style={[typeStyle(font.secondary), { color: c.textMuted }]}
                  >
                    {goalLabel(goal)}
                  </Text>
                </View>
              ) : null}
              {summary.unusable > 0 ? (
                <Text
                  maxFontSizeMultiplier={rules.maxFontScale}
                  style={[typeStyle(font.secondary), { color: c.textMuted }]}
                >
                  {`${summary.unusable} ${
                    summary.unusable === 1 ? 'session needs' : 'sessions need'
                  } a page or a time before they can count. They are on each book’s page.`}
                </Text>
              ) : null}
            </View>

            {/* ── the daily pace chart, always the last 14 days ── */}
            <View style={styles.section}>
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

            {/* ── the genre breakdown ── */}
            <View style={styles.section}>
              <View style={styles.titleRow}>
                <Text
                  accessibilityRole="header"
                  maxFontSizeMultiplier={rules.maxFontScale}
                  style={[typeStyle(font.heading), { color: c.text }]}
                >
                  What you read
                </Text>
                <Text
                  maxFontSizeMultiplier={rules.maxFontScale}
                  style={[typeStyle(font.secondary), { color: c.textMuted }]}
                >
                  {summary.books === 0
                    ? `No books finished in ${selected}`
                    : `${summary.books} ${summary.books === 1 ? 'book' : 'books'} in ${selected}`}
                </Text>
              </View>
              {tallies.length > 0 ? (
                <>
                  <GenreBreakdown tallies={tallies} total={summary.books} />
                  <Text
                    maxFontSizeMultiplier={rules.maxFontScale}
                    style={[typeStyle(font.secondary), { color: c.textMuted }]}
                  >
                    Genres are guessed from each book’s details. Put one right in Edit details
                    and it stays put.
                  </Text>
                </>
              ) : (
                <Text
                  maxFontSizeMultiplier={rules.maxFontScale}
                  style={[typeStyle(font.secondary), { color: c.textMuted }]}
                >
                  {`Finish a book and it will show up here. Nothing is locked.`}
                </Text>
              )}
            </View>
          </ScrollView>
        ) : null}
      </SkeletonGate>
    </Screen>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { gap: space.section, paddingBottom: space.section },
  section: { gap: space.row },
  years: { flexDirection: 'row', gap: space.labelGap },
  goal: { gap: space.labelGap },
  goalTrack: { height: size.genreBar, borderRadius: radius.skeleton, overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: radius.skeleton },
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
