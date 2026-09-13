/**
 * One session in book detail's history, from `BookDetail.dc.html`:
 *   "28 pages · 184 → 212"
 *   "Yesterday, 9:40 pm · 41m"
 *
 * Read-only in Slice 2. The artboard's edit pencil opens the session editor, which is
 * Slice 3; until then there is no pencil, rather than a pencil that does nothing.
 *
 * A session that counts for nothing — backwards, half-filled, empty — is marked, so the
 * reader can find the row that explains an odd total instead of distrusting every total.
 */

import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { SessionEntry } from '../queries'
import { sessionLine } from '../sessionLine'
import { formatRelativeDay, formatTime } from '@/lib/dates'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

export const SessionRow = memo(function SessionRow({ session }: { session: SessionEntry }) {
  const c = useColors()
  const line = sessionLine(session)
  const when = `${formatRelativeDay(session.occurredAt)}, ${formatTime(session.occurredAt)}`

  return (
    <View
      accessible
      accessibilityLabel={[
        line.amount,
        when,
        line.duration,
        line.needsFix ? 'needs fixing' : null,
      ]
        .filter(Boolean)
        .join(', ')}
      style={[styles.row, { borderColor: c.border }]}
    >
      <Text
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.bodyStrong), { color: c.text }]}
      >
        {line.amount}
      </Text>
      <Text
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.secondary), { color: c.textMuted }]}
      >
        {[when, line.duration].filter(Boolean).join(' · ')}
      </Text>
      {line.needsFix ? (
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.label), { color: c.danger }]}
        >
          {/* A timed session with broken positions still counts its duration, so saying
              "not counted" there would be false (domain/stats.ts, `contribution`). */}
          {line.duration !== null
            ? 'Only its time counts until it is fixed'
            : 'Not counted in your totals until it is fixed'}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  row: { gap: space.labelGap, paddingVertical: space.cardTight, borderBottomWidth: 1 },
})
