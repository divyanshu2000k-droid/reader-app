/**
 * Settings, reachable from the Library header. Slice 1 makes it reachable; Journey K's
 * contents (goal, theme, notifications, import, export, recently deleted, account) arrive
 * with the slices that build each of them.
 *
 * It carries the app version, and in development builds only, the device-pass button that
 * lived on the Slice 0 placeholder route.
 */

import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { DATABASE_NAME } from '@/db/client'
import { getGoal, setGoal } from '@/db/goals'
import { checkGoal } from '@/domain/goal'
import { runDevicePass } from '@/db/devPass'
import { seedLargeLibrary } from '@/db/seedLarge'
import { appName, appVersion, config, usesSandboxDatabase } from '@/lib/config'
import { FAULTS, isFaultArmed, setFault, type FaultName } from '@/lib/faults'
import { localYearOf, now } from '@/lib/dates'
import { actions, nav } from '@/lib/strings'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Field } from '@/ui/Field'
import { Header } from '@/ui/Header'
import { Screen } from '@/ui/Screen'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

export function SettingsScreen() {
  const c = useColors()
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const year = localYearOf(now())
  const [goalText, setGoalText] = useState('')
  const [goalSaved, setGoalSaved] = useState<number | null>(null)
  const checked = checkGoal(goalText)

  useEffect(() => {
    let cancelled = false
    void getGoal(year).then((goal) => {
      if (cancelled) return
      const target = goal?.targetBooks ?? null
      setGoalSaved(target)
      setGoalText(target === null ? '' : String(target))
    })
    return () => {
      cancelled = true
    }
  }, [year])

  /**
   * The latest typed value and the last saved one, for the unmount save below.
   *
   * Refs, not state: a cleanup function closes over the state of the render that created it,
   * so reading `goalText` there would save whatever was typed several keystrokes ago.
   */
  const latest = useRef({ text: goalText, saved: goalSaved })
  // In an effect, not during render: a ref written while rendering is the thing
  // `react-hooks/refs` forbids, and it would also be wrong under StrictMode's double render.
  useEffect(() => {
    latest.current = { text: goalText, saved: goalSaved }
  })

  /**
   * Write the goal, if what is typed is a target and it has actually changed.
   *
   * The no-change guard is not tidiness: `setGoal` writes through `db/write.ts`, so saving
   * unconditionally would queue a sync row every time the reader tapped the field and tapped
   * away again.
   */
  const saveGoal = useCallback(async () => {
    const { text, saved } = latest.current
    const result = checkGoal(text)
    if (!result.ok || result.target === saved) return
    const written = await setGoal(year, result.target)
    if (written.ok) {
      latest.current = { text, saved: result.target }
      setGoalSaved(result.target)
    }
  }, [year])

  /**
   * SAVE ON THE WAY OUT, not only on blur.
   *
   * Blur alone loses the goal, and a phone check proved it on 2026-09-20: type 12, tap
   * Done, and the field never blurs because the screen is already gone — `goals` stayed
   * empty and the reader had no way to know. Android does not promise a blur before an
   * unmount, and Done and the system Back gesture both leave without one.
   *
   * So the field saves on blur AND this saves on teardown. Both are guarded by the
   * no-change check, so the ordinary path still writes exactly once.
   */
  useEffect(() => {
    return () => {
      void saveGoal()
    }
  }, [saveGoal])
  const [seeding, setSeeding] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  // Mirrors lib/faults.ts so the chips redraw; the module is the truth.
  const [, setFaultsVersion] = useState(0)

  function toggleFault(name: FaultName) {
    // `__DEV__` literally: Metro makes it `false` in a release bundle, and faults.test.ts
    // fails if this argument is anything else.
    setFault(__DEV__, name, !isFaultArmed(name))
    setFaultsVersion((v) => v + 1)
  }

  async function devicePass() {
    setRunning(true)
    try {
      setSummary(await runDevicePass())
    } catch (e) {
      setSummary(e instanceof Error ? `crashed: ${e.message}` : 'crashed')
    } finally {
      setRunning(false)
    }
  }

  async function seedAtScale(plan?: Parameters<typeof seedLargeLibrary>[0]) {
    setSeeding(true)
    try {
      const result = await seedLargeLibrary(plan)
      setSummary(
        result.ok
          ? `seeded ${result.value.books} books, ${result.value.reads} reads, ` +
              `${result.value.sessions} sessions in ${(result.value.ms / 1000).toFixed(1)}s`
          : `${result.error.message}. ${result.error.safe ?? ''}`.trim(),
      )
    } catch (e) {
      setSummary(e instanceof Error ? `crashed: ${e.message}` : 'crashed')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <Screen>
      <Header
        title={nav.settings.title}
        right={<Button label={actions.done} variant="ghost" onPress={() => router.back()} />}
      />
      <View style={styles.body}>
        {/*
         * THE YEARLY GOAL (Slice 7, Journey K).
         *
         * Saved on blur rather than behind a Save button: it is one optional number, and a
         * button the reader can walk away from without pressing is how a setting silently
         * does not take. Clearing the field removes the goal, which the label says, because
         * a target is optional and stats are never gated behind one.
         */}
        <View style={styles.block}>
          <Field
            label={`Books to read in ${year} · optional`}
            value={goalText}
            onChangeText={setGoalText}
            keyboardType="number-pad"
            onBlur={() => void saveGoal()}
            error={checked.ok ? undefined : checked.reason}
          />
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.secondary), { color: c.textMuted }]}
          >
            {goalSaved === null
              ? 'Leave it empty and nothing is tracked against a target. Pages and hours are counted either way.'
              : `Saved. Your progress shows on Stats.`}
          </Text>
        </View>

        {/* Journey K: Recently deleted belongs to Settings. The rest of that list arrives
            with the slices that build each item. */}
        <Button
          label="Recently deleted"
          variant="secondary"
          onPress={() => router.push('/trash')}
        />
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.secondary), { color: c.textMuted }]}
        >
          {appVersion ? `${appName} ${appVersion}` : appName}
        </Text>

        {__DEV__ ? (
          <View style={styles.dev}>
            {/* The pass is destructive, so it runs only on its own database. Saying which
                one the app is on is the difference between "my library is empty" and
                "this build is not looking at my library". */}
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.label), { color: c.textMuted }]}
            >
              {usesSandboxDatabase
                ? `Sandbox build: open on ${DATABASE_NAME}, not your library.`
                : `Open on ${DATABASE_NAME}, your real library. Destructive dev tools are off.`}
            </Text>
            <Button
              label="Run device checks"
              busyLabel="Running checks"
              busy={running}
              disabled={!config.devicePass || seeding}
              variant="secondary"
              onPress={() => void devicePass()}
            />
            <Button
              label="Seed 2000 books"
              busyLabel="Seeding"
              busy={seeding}
              disabled={!usesSandboxDatabase || running}
              variant="secondary"
              onPress={() => void seedAtScale()}
            />
            {/* A new reader's library is a dozen books, not two thousand, and its DNF tab is
                empty: the shapes the big seed never shows. */}
            <Button
              label="Seed 12 books, no DNF"
              busyLabel="Seeding"
              busy={seeding}
              disabled={!usesSandboxDatabase || running}
              variant="secondary"
              onPress={() =>
                void seedAtScale({ books: 12, statuses: ['reading', 'want', 'finished'] })
              }
            />
            {/* Forced failures, to see each failure render on a phone (lib/faults.ts). In
                memory only: a reload clears them. */}
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.label), { color: c.textMuted }]}
            >
              Force a failure. Cleared on reload.
            </Text>
            <View style={styles.faults}>
              {FAULTS.map((f) => (
                <Chip
                  key={f.name}
                  label={f.label}
                  selected={isFaultArmed(f.name)}
                  onPress={() => toggleFault(f.name)}
                />
              ))}
            </View>
            {summary ? (
              <Text
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.label), { color: c.textMuted }]}
              >
                {summary} · see logcat for detail
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  block: { gap: space.labelGap },
  body: { gap: space.section },
  dev: { gap: space.row },
  faults: { flexDirection: 'row', flexWrap: 'wrap', gap: space.row },
})
