/**
 * Earlier reads of this book. Each is its own `reads` row with its own rating, dates and
 * sessions, and starting a re-read never touched it (04-SCREENS, Journey F).
 */

import { StyleSheet, Text, View } from 'react-native'

import type { ReadSummary } from '../queries'
import { effectiveFinishedAt } from '@/domain/finishes'
import { formatDate, formatDuration } from '@/lib/dates'
import { status as statusCopy } from '@/lib/strings'
import { Stars } from '@/ui/Stars'
import { font, radius, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

export function PreviousReads({ reads }: { reads: readonly ReadSummary[] }) {
  const c = useColors()
  if (reads.length === 0) return null

  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.heading), { color: c.text }]}
      >
        Earlier reads
      </Text>
      {reads.map((r) => {
        // One rule for every screen (domain/finishes.ts).
        const finished = effectiveFinishedAt(r)
        return (
          <View
            key={r.readId}
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
          >
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.bodyStrong), { color: c.text }]}
            >
              {`Read ${r.readNumber} · ${statusCopy[r.status]}`}
              {finished !== null ? ` · ${formatDate(finished)}` : ''}
            </Text>
            {r.rating !== null ? <Stars rating={r.rating} /> : null}
            {r.review ? (
              <Text
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.body), { color: c.textSecondary }]}
              >
                {r.review}
              </Text>
            ) : null}
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.secondary), { color: c.textMuted }]}
            >
              {[
                r.pagesRead > 0 ? `${r.pagesRead} pages` : null,
                r.minutesRead > 0 ? formatDuration(Math.round(r.minutesRead * 60)) : null,
                `${r.sessionCount} ${r.sessionCount === 1 ? 'session' : 'sessions'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space.row, paddingTop: space.section },
  card: {
    gap: space.labelGap,
    padding: space.cardTight,
    borderWidth: 1,
    borderRadius: radius.card,
  },
})
