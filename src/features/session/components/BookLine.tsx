/** The book a session belongs to, small, above the form: Session.dc.html's cover and title. */

import { StyleSheet, Text, View } from 'react-native'

import type { LogBook } from '../queries'
import { BookCover } from '@/ui/BookCover'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

export function BookLine({ book }: { book: LogBook }) {
  const c = useColors()
  return (
    <View style={styles.row}>
      <BookCover
        title={book.title}
        localPath={book.coverLocalPath}
        url={book.coverUrl}
        color={book.coverColor}
        size="header"
      />
      <View style={styles.text}>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.bodyStrong), { color: c.text }]}
        >
          {book.title}
        </Text>
        {book.author ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.secondary), { color: c.textMuted }]}
          >
            {book.author}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.rowWide },
  text: { flex: 1, gap: space.labelGap },
})
