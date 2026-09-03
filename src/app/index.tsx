/**
 * src/app/index.tsx
 *
 * Slice 0 placeholder. Proves the theme tokens render and that migrations run.
 * Slice 1 replaces this with the four launch gates and the tab shell.
 */

import { Text, View } from 'react-native'

import { useMigrationStatus } from '@/db/migrate'
import { Screen } from '@/ui/Screen'
import { font } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

export default function Index() {
  const c = useColors()
  const status = useMigrationStatus()

  const line =
    status.state === 'pending'
      ? 'opening database'
      : status.state === 'done'
        ? `schema v${status.version}`
        : status.error

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
      </View>
    </Screen>
  )
}
