/**
 * src/app/index.tsx
 *
 * Slice 0 placeholder. Proves the theme tokens render and that migrations run.
 * Slice 1 replaces this with the four launch gates and the tab shell.
 */

import { useState } from 'react'
import { Text, View } from 'react-native'

import { useMigrationStatus } from '@/db/migrate'
import { Button } from '@/ui/Button'
import { Screen } from '@/ui/Screen'
import { font } from '@/ui/theme'
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
      const mod = require('../db/devchecks') as {
        runDeviceChecks: () => Promise<{ name: string; passed: boolean }[]>
      }
      const results = await mod.runDeviceChecks()
      const passed = results.filter((r) => r.passed).length
      setDevSummary(`${passed}/${results.length} passed`)
    } catch (e) {
      setDevSummary(e instanceof Error ? `crashed: ${e.message}` : 'crashed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
        <Text style={{ color: c.text, fontSize: font.title.size, fontWeight: '700' }}>
          Reader
        </Text>
        <Text style={{ color: c.textMuted, fontSize: font.body.size }}>
          Slice 0 · foundations
        </Text>
        <Text
          style={{
            color: status.state === 'failed' ? c.danger : c.textFaint,
            fontSize: font.label.size,
          }}
        >
          {line}
        </Text>

        {__DEV__ ? (
          <View style={{ gap: 8, marginTop: 24 }}>
            <Button
              label="Run device checks"
              busyLabel="Running checks"
              busy={running}
              variant="secondary"
              onPress={runDevChecks}
            />
            {devSummary ? (
              <Text style={{ color: c.textMuted, fontSize: font.label.size }}>
                {devSummary} · see logcat for detail
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  )
}
