/**
 * One session in book detail's history, from `BookDetail.dc.html`:
 *   "28 pages · 184 → 212"
 *   "Yesterday, 9:40 pm · 41m"
 *
 * The whole row opens the session editor, and carries the artboard's pencil to say so. Every
 * session is editable and deletable from here, forever (04-SCREENS, Journey E).
 *
 * A session that counts for nothing — backwards, half-filled, empty — is marked, so the
 * reader can find the row that explains an odd total instead of distrusting every total.
 */

import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { SessionEntry } from '../queries'
import { sessionLine } from '@/domain/sessionLine'
import { formatWhen } from '@/lib/dates'
import { Icon } from '@/ui/Icon'
import { font, iconSize, motion, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  session: SessionEntry
  /** Opens the editor. A stable, press-guarded callback from the screen. */
  onEdit: (sessionId: string) => void
}

export const SessionRow = memo(function SessionRow({ session, onEdit }: Props) {
  const c = useColors()
  const line = sessionLine(session)
  // formatWhen, the logger's own wording: a session from last year said "23 Aug", which reads
  // as this year. Found on the phone, Slice 3.
  const when = formatWhen(session.occurredAt)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        line.amount,
        when,
        line.duration,
        line.needsFix ? 'needs fixing' : null,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint="Edit or delete this session"
      onPress={() => onEdit(session.id)}
      style={({ pressed }) => [
        styles.row,
        { borderColor: c.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.text}>
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
      <Icon name="pencil" size={iconSize.header} color={c.textFaint} />
    </Pressable>
  )
})

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cardTight,
    paddingVertical: space.cardTight,
    borderBottomWidth: 1,
  },
  text: { flex: 1, gap: space.labelGap },
  pressed: { opacity: motion.press.opacity },
})
