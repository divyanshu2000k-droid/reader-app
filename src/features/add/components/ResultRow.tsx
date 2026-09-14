/**
 * One search result, from AddBook.dc.html: cover, title, author, "Bloomsbury · 2020 · 245pp",
 * and an add button. A result that is already in the library says so instead, and opens the
 * reader's own copy: adding it again would split its sessions across two books.
 */

import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { resultDetail, type SearchResult } from '../searchMerge'
import { BookCover } from '@/ui/BookCover'
import { Button } from '@/ui/Button'
import { Icon } from '@/ui/Icon'
import {
  font,
  iconSize,
  iconStroke,
  motion,
  radius,
  rules,
  size,
  space,
  typeStyle,
} from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  result: SearchResult
  /** The library book this result already is, or null. */
  inLibrary: string | null
  onAdd: (result: SearchResult) => void
  onOpen: (bookId: string) => void
}

export const ResultRow = memo(function ResultRow({ result, inLibrary, onAdd, onOpen }: Props) {
  const c = useColors()
  const author = result.authors.join(', ')
  const detail = resultDetail(result)
  const label = [result.title, author, detail].filter(Boolean).join(', ')

  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <BookCover title={result.title} url={result.coverUrl} size="list" />
      <View style={styles.text}>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.bodyStrong), { color: c.text }]}
        >
          {result.title}
        </Text>
        {author ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.secondary), { color: c.textMuted }]}
          >
            {author}
          </Text>
        ) : null}
        {detail ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.caption), { color: c.textMuted }]}
          >
            {detail}
          </Text>
        ) : null}
        {inLibrary !== null ? (
          <Button
            label="In your library"
            variant="pill"
            accessibilityLabel={`${result.title} is in your library. Open it`}
            onPress={() => onOpen(inLibrary)}
            style={styles.inLibrary}
          />
        ) : null}
      </View>
      {inLibrary === null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add ${label}`}
          hitSlop={size.hitSlopTight}
          onPress={() => onAdd(result)}
          style={({ pressed }) => [
            styles.add,
            { backgroundColor: c.accent, borderRadius: radius.pill },
            pressed && styles.pressed,
          ]}
        >
          <Icon
            name="plus"
            size={iconSize.header}
            color={c.onAccent}
            strokeWidth={iconStroke.raised}
          />
        </Pressable>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.rowWide,
    padding: space.cardTight,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  text: { flex: 1, gap: space.labelGap },
  add: {
    width: size.minTouch,
    height: size.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inLibrary: { alignSelf: 'flex-start' },
  pressed: { transform: [{ scale: motion.press.scale }] },
})
