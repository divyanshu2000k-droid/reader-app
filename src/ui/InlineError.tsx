/**
 * src/ui/InlineError.tsx
 *
 * Tier 1 of the error contract: recoverable, shown inline, with a retry, stating what is
 * still safe (06-CONVENTIONS, Errors). Not a modal and not the error boundary — those are
 * tiers 2 and 3, and using a heavier one here teaches the reader that ordinary hiccups are
 * catastrophes.
 *
 * It sits above the content it failed to load rather than replacing it, so a stale list
 * stays readable while the retry runs.
 */

import { StyleSheet, Text, View } from 'react-native'

import { Button } from './Button'
import { font, radius, rules, space, typeStyle } from './theme'
import { useColors } from './useTheme'
import { actions } from '@/lib/strings'
import type { AppError } from '@/lib/result'

interface Props {
  error: AppError
  onRetry?: (() => void) | undefined
  busy?: boolean
}

export function InlineError({ error, onRetry, busy = false }: Props) {
  const c = useColors()

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.wrap,
        {
          backgroundColor: c.dangerSurface,
          borderColor: c.dangerBorder,
          borderRadius: radius.card,
        },
      ]}
    >
      <View style={styles.text}>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.bodyStrong), { color: c.text }]}
        >
          {error.message}
        </Text>
        {error.safe ? (
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            // textSecondary, not textMuted: textMuted on dangerSurface measured 4.03:1 in light
            // mode, below AA. The pair is in contrast.test.ts's SPECIAL list.
            style={[typeStyle(font.label), { color: c.textSecondary }]}
          >
            {error.safe}
          </Text>
        ) : null}
      </View>
      {onRetry ? (
        <Button
          label={actions.tryAgain}
          busyLabel={actions.tryingAgain}
          busy={busy}
          variant="secondary"
          onPress={onRetry}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.cardTight,
    padding: space.cardTight,
    borderWidth: 1,
  },
  text: { gap: space.labelGap },
})
