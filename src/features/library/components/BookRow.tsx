/**
 * src/features/library/components/BookRow.tsx
 *
 * One book in the Library list, from `Main.dc.html`: cover, title, author, progress, and on a
 * book being read, the Continue pill, which opens the session logger.
 *
 * MEMOISED, and every prop it takes is a primitive or a stable callback. A row that
 * re-renders when its neighbour changes is what turns a 2000-book scroll into 40fps, and
 * FlashList recycles these aggressively.
 *
 * The row opens book detail; the pill opens the logger. Continue then Save is the two-tap
 * budget from the home screen (`rules.maxTapsToLog`). Only on the Reading tab: a book on Want
 * or Finished is not being continued, and its detail screen has Log pages for a backfill.
 */

import { memo } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import type { LibraryRow } from '../queries'
import { pillBelowText } from '../rowLayout'
import { isAudiobook, progressDisplay } from '@/domain/progressDisplay'
import { BookCover } from '@/ui/BookCover'
import { Button } from '@/ui/Button'
import { ProgressBar } from '@/ui/ProgressBar'
import { font, motion, radius, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  row: LibraryRow
  onOpen: (bookId: string) => void
  onContinue: (bookId: string) => void
}

export const BookRow = memo(function BookRow({ row, onOpen, onContinue }: Props) {
  const c = useColors()
  const display = progressDisplay(row)
  const active = row.status === 'reading'
  const audio = isAudiobook(row)
  // Nothing, never "Unknown", when there is no author (03-DATA-MODEL). And no empty line
  // either: a blank Text still takes a line's height, which the phone showed as a gap.
  const byline = [row.author, audio ? 'audio' : null].filter(Boolean).join(' · ')
  // Beside the text when there is room, below it when not (rowLayout.ts).
  const { width, fontScale } = useWindowDimensions()
  const below = pillBelowText(width, fontScale, rules.minScreenWidth)
  const pill = active ? (
    <Button
      label="Continue"
      variant="pill"
      accessibilityLabel={`Log a session for ${row.title}`}
      onPress={() => onContinue(row.bookId)}
      style={below ? styles.pillBelow : undefined}
    />
  ) : null

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[row.title, row.author, display.label].filter(Boolean).join(', ')}
      onPress={() => onOpen(row.bookId)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: active ? c.surfaceRaised : c.surface,
          borderColor: active ? c.borderStrong : c.border,
          borderRadius: radius.card,
        },
        pressed && styles.pressed,
      ]}
    >
      <BookCover
        title={row.title}
        localPath={row.coverLocalPath}
        url={row.coverUrl}
        color={row.coverColor}
        size="list"
      />
      <View style={styles.text}>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.bodyStrong), { color: c.text }]}
        >
          {row.title}
        </Text>
        {byline ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.secondary), { color: c.textMuted }]}
          >
            {byline}
          </Text>
        ) : null}
        {display.fraction !== null || display.label !== null ? (
          <View style={styles.progress}>
            <ProgressBar fraction={display.fraction} active={active} style={styles.bar} />
            {display.label ? (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.caption), { color: c.textMuted }]}
              >
                {display.label}
              </Text>
            ) : null}
          </View>
        ) : null}
        {below ? pill : null}
      </View>
      {below ? null : pill}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.rowWide,
    padding: space.cardTight,
    borderWidth: 1,
  },
  text: { flex: 1, gap: space.labelGap },
  progress: { flexDirection: 'row', alignItems: 'center', gap: space.row },
  bar: { flex: 1 },
  pillBelow: { alignSelf: 'flex-start' },
  pressed: { transform: [{ scale: motion.press.scale }] },
})
