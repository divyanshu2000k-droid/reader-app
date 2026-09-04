/**
 * src/app/index.tsx
 *
 * Slice 0 placeholder. Proves the theme tokens render and that migrations run.
 * Slice 1 replaces this with the four launch gates and the tab shell.
 */

import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'

import { useMigrationStatus } from '@/db/migrate'
import { Button } from '@/ui/Button'
import { Screen } from '@/ui/Screen'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

export default function Index() {
  const c = useColors()
  const status = useMigrationStatus()
  const [devSummary, setDevSummary] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const line =
    status.state === 'pending'
      ? 'opening database'
      : status.state === 'done'
        ? `schema v${status.version}`
        : status.error

  /**
   * DEV ONLY. Runs the device pass.
   *
   * The module is reached through `require()` inside this `__DEV__` branch rather than a
   * top-level import. Metro substitutes `false` for `__DEV__` in a production bundle and
   * drops the dead branch, so `deviceChecks` is never bundled and never reachable in a
   * release build. A top-level import would be bundled regardless.
   *
   * Slice 11 has a checklist item to verify this against the real release bundle.
   */
  async function runDevChecks() {
    if (!__DEV__) return
    setRunning(true)
    try {
      // Relative, not the `@/` alias: Metro resolves the tsconfig path aliases for
      // static `import` but not for `require`, so an aliased require fails at runtime
      // with "Cannot find module" while still typechecking cleanly.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../db/devchecks') as typeof import('../db/devchecks')
      const results = await mod.runDeviceChecks()

      // `summarise` rather than a tally recomputed here. The counts are reported runtime
      // and compile-time separately on purpose (DECISIONS.md, 2026-09-03), and a second
      // implementation of that split is a second thing that can drift back into one
      // inflated number. It also stopped `summarise` being dead code.
      const s = mod.summarise(results)
      setDevSummary(
        `RUNTIME ${s.runtimePassed}/${s.runtimeTotal} · ` +
          `COMPILE-TIME ${s.compilePassed}/${s.compileTotal}`,
      )
    } catch (e) {
      setDevSummary(e instanceof Error ? `crashed: ${e.message}` : 'crashed')
    } finally {
      setRunning(false)
    }
  }

  /**
   * Run the device pass without a human tap.
   *
   * Start Metro with `EXPO_PUBLIC_DEVICE_PASS=1` and the pass runs on mount. Added
   * because driving the button over `adb shell input tap` proved unreliable — taps did
   * not reach the JS handler even with the window focused — and because a check suite
   * that can only be started by a finger cannot be run from a script later.
   *
   * `__DEV__` gates it exactly like the button, so it cannot ship.
   */
  useEffect(() => {
    if (!__DEV__ || process.env.EXPO_PUBLIC_DEVICE_PASS !== '1') return
    // Deferred out of the effect body: the checks set state as they run, and starting
    // them synchronously here is the pattern react-hooks/set-state-in-effect exists to
    // stop. A timeout of zero also lets the first frame paint before ~40s of database
    // work begins, so the screen is never blank while it runs.
    const t = setTimeout(() => void runDevChecks(), 0)
    return () => clearTimeout(t)
    // Mount only: a one-shot trigger, not a reaction to changing state.
  }, [])

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.row }}>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.title), { color: c.text }]}
        >
          Reader
        </Text>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.body), { color: c.textMuted }]}
        >
          Slice 0 · foundations
        </Text>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[
            typeStyle(font.label),
            { color: status.state === 'failed' ? c.danger : c.textFaint },
          ]}
        >
          {line}
        </Text>

        {__DEV__ ? (
          <View style={{ gap: space.row, marginTop: space.section }}>
            <Button
              label="Run device checks"
              busyLabel="Running checks"
              busy={running}
              variant="secondary"
              onPress={runDevChecks}
            />
            {devSummary ? (
              <Text
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.label), { color: c.textMuted }]}
              >
                {devSummary} · see logcat for detail
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  )
}
