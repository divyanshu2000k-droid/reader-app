/**
 * src/ui/OfflineBanner.tsx
 *
 * "Offline. Logging still works, syncing later." From States.dc.html (08): it reassures, it
 * does not alarm. It sits under the header, never blocks the screen and is never a modal,
 * because the app genuinely works offline.
 */

import { StyleSheet, Text, View } from 'react-native'

import { Icon } from './Icon'
import { font, iconSize, radius, rules, space, typeStyle } from './theme'
import { useColors } from './useTheme'
import { errors } from '@/lib/strings'

export function OfflineBanner({ detail }: { detail?: string | null }) {
  const c = useColors()
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={[errors.offline.message, detail].filter(Boolean).join(' ')}
      style={[styles.banner, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <Icon name="wifi" size={iconSize.header} color={c.textFaint} />
      <View style={styles.text}>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.secondary), { color: c.textSecondary }]}
        >
          {errors.offline.message}
        </Text>
        {detail ? (
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.label), { color: c.textMuted }]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.stackTight,
    paddingHorizontal: space.cardTight,
    paddingVertical: space.stackTight,
    borderWidth: 1,
    borderRadius: radius.buttonSmall,
  },
  text: { flex: 1, gap: space.labelGap },
})
