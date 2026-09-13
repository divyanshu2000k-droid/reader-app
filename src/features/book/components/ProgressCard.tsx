/**
 * Where the reader is in this read, from `BookDetail.dc.html`: position, total, percentage,
 * and the bar.
 *
 * Driven by `progressDisplay` in domain/, the same rules the Library row uses, so the two
 * screens cannot disagree about one book. The artboard's "Log pages" and "Start timer"
 * buttons arrive with the screens they open (Slices 3 and 6).
 */

import { StyleSheet, Text, View } from 'react-native'

import type { BookSummary, ReadSummary } from '../queries'
import { isAudiobook, progressDisplay } from '@/domain/progressDisplay'
import { formatDuration } from '@/lib/dates'
import { ProgressBar } from '@/ui/ProgressBar'
import { font, radius, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  book: BookSummary
  read: ReadSummary
}

export function ProgressCard({ book, read }: Props) {
  const c = useColors()
  const display = progressDisplay({
    ...read,
    pageCount: book.pageCount,
    totalMinutes: book.totalMinutes,
  })
  const audio = isAudiobook({
    totalMinutes: book.totalMinutes,
    page: read.page,
    minute: read.minute,
  })

  // The big number: where the reader is. A position, never a sum, so it matches the book.
  const headline = audio
    ? read.minute !== null
      ? formatDuration(read.minute * 60)
      : null
    : read.page !== null
      ? String(read.page)
      : null
  const of = audio
    ? book.totalMinutes !== null
      ? `of ${formatDuration(book.totalMinutes * 60)}`
      : null
    : book.pageCount !== null
      ? `/ ${book.pageCount} pages`
      : read.page !== null
        ? 'pages in'
        : null

  if (headline === null && read.sessionCount === 0) {
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.body), { color: c.textMuted }]}
        >
          No sessions yet.
        </Text>
      </View>
    )
  }

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.numbers}>
        {headline !== null ? (
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.display), { color: c.text }]}
          >
            {headline}
          </Text>
        ) : null}
        {of ? (
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.body), styles.of, { color: c.textMuted }]}
          >
            {of}
          </Text>
        ) : null}
        {display.fraction !== null ? (
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.bodyStrong), { color: c.accentInk }]}
          >
            {Math.round(display.fraction * 100)}%
          </Text>
        ) : null}
      </View>
      {display.fraction !== null ? (
        <ProgressBar fraction={display.fraction} active={read.status === 'reading'} />
      ) : null}
      {/* Pages and time, separately, never summed (01-PRODUCT; DECISIONS.md, 2026-09-10). */}
      <Text
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.label), { color: c.textMuted }]}
      >
        {[
          read.pagesRead > 0 ? `${read.pagesRead} pages read` : null,
          read.minutesRead > 0
            ? `${formatDuration(Math.round(read.minutesRead * 60))} of reading`
            : null,
          `${read.sessionCount} ${read.sessionCount === 1 ? 'session' : 'sessions'}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.row, padding: space.cardTight, borderWidth: 1, borderRadius: radius.card },
  numbers: { flexDirection: 'row', alignItems: 'baseline', gap: space.row, flexWrap: 'wrap' },
  of: { flex: 1 },
})
