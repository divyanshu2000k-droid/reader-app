/**
 * Settings, reachable from the Library header. Slice 1 makes it reachable; Journey K's
 * contents (goal, theme, notifications, import, export, recently deleted, account) arrive
 * with the slices that build each of them.
 *
 * It carries the app version, and in development builds only, the device-pass button that
 * lived on the Slice 0 placeholder route.
 */

import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { runDevicePass } from '@/db/devPass'
import { appName, appVersion, config } from '@/lib/config'
import { actions, nav } from '@/lib/strings'
import { Button } from '@/ui/Button'
import { Header } from '@/ui/Header'
import { Screen } from '@/ui/Screen'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

export function SettingsScreen() {
  const c = useColors()
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)

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

  return (
    <Screen>
      <Header
        title={nav.settings.title}
        right={<Button label={actions.done} variant="ghost" onPress={() => router.back()} />}
      />
      <View style={styles.body}>
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
              {config.devicePass
                ? 'Device-pass build: running on devcheck.db, not your library.'
                : 'Device checks need EXPO_PUBLIC_DEVICE_PASS=1, which opens a separate database.'}
            </Text>
            <Button
              label="Run device checks"
              busyLabel="Running checks"
              busy={running}
              disabled={!config.devicePass}
              variant="secondary"
              onPress={() => void devicePass()}
            />
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
  body: { gap: space.section },
  dev: { gap: space.row },
})
