/**
 * src/ui/EmptyState.tsx
 *
 * Every list has one, and every one names a specific next action. "No data" is not an
 * empty state, it is a dead end.
 *
 * The copy lives in `lib/strings.ts` so the same list does not say three different
 * things in three places.
 */

import { StyleSheet, Text, View } from 'react-native'

import { Button } from './Button'
import { font, rules, space, typeStyle } from './theme'
import { useColors } from './useTheme'

interface Props {
  title: string
  body: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ title, body, actionLabel, onAction }: Props) {
  const c = useColors()

  return (
    <View style={styles.wrap}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.heading), { color: c.text }]}
      >
        {title}
      </Text>
      <Text
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.body), { color: c.textMuted, textAlign: 'center' }]}
      >
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.stackTight,
    paddingHorizontal: space.screen,
    paddingVertical: space.section,
  },
})
