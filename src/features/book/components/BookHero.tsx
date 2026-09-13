/**
 * The top of book detail, from `BookDetail.dc.html`: cover, title, author, rating, and two
 * small badges for status and format.
 */

import { StyleSheet, Text, View } from 'react-native'

import type { BookSummary, ReadSummary } from '../queries'
import { isAudiobook } from '@/domain/progressDisplay'
import { status as statusCopy } from '@/lib/strings'
import { BookCover } from '@/ui/BookCover'
import { Stars } from '@/ui/Stars'
import { font, radius, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  book: BookSummary
  read: ReadSummary
}

/** "PRINT · 502PP", "AUDIO · 11H", "AUDIO": the format, and its length when known. */
function formatBadge(book: BookSummary, read: ReadSummary): string {
  if (isAudiobook({ totalMinutes: book.totalMinutes, page: read.page, minute: read.minute })) {
    return book.totalMinutes !== null
      ? `Audio · ${Math.round(book.totalMinutes / 60)}h`
      : 'Audio'
  }
  return book.pageCount !== null ? `Print · ${book.pageCount}pp` : 'Print'
}

export function BookHero({ book, read }: Props) {
  const c = useColors()

  return (
    <View style={styles.hero}>
      <BookCover
        title={book.title}
        localPath={book.coverLocalPath}
        url={book.coverUrl}
        color={book.coverColor}
        size="hero"
      />
      <View style={styles.text}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.title), { color: c.text }]}
        >
          {book.title}
        </Text>
        {book.author ? (
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.body), { color: c.textMuted }]}
          >
            {book.author}
          </Text>
        ) : null}
        {read.rating !== null ? <Stars rating={read.rating} /> : null}
        <View style={styles.badges}>
          {[
            read.readNumber > 1
              ? `${statusCopy[read.status]} · read ${read.readNumber}`
              : statusCopy[read.status],
            formatBadge(book, read),
          ].map((label) => (
            <Text
              key={label}
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[
                typeStyle(font.caption),
                styles.badge,
                { color: c.textSecondary, backgroundColor: c.surface, borderColor: c.border },
              ]}
            >
              {label.toUpperCase()}
            </Text>
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: space.rowWide, alignItems: 'flex-start' },
  text: { flex: 1, gap: space.labelGap },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.labelGap },
  badge: {
    borderWidth: 1,
    borderRadius: radius.chip,
    paddingHorizontal: space.chipPadX,
    paddingVertical: space.labelGap,
    overflow: 'hidden',
  },
})
