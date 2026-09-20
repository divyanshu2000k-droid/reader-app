/**
 * THE THREE NUMBERS: books, pages, hours. Side by side, never added together.
 *
 * `domain/stats.ts` makes combining them impossible in the type system; this is the screen
 * honouring the same rule visually. Three equal columns, each labelled, with no total
 * anywhere — because the moment a reader sees one number they will treat it as the number,
 * and a figure that mixed an audiobook's hours into a page count would be exactly the
 * complaint this product exists to avoid.
 *
 * **Books is a different kind of fact from the other two**, and the caption says so: pages
 * and hours are what the reader logged during the year, books is what they FINISHED in it.
 * A book started in December and finished in January contributes its pages to December and
 * itself to January. Both are right; the screen does not pretend they are one measure.
 */

import { StyleSheet, Text, View } from 'react-native'

import type { YearSummary } from '../yearSummary'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  summary: YearSummary
}

/** "1,248" — grouped, because a four-figure page count is unreadable without it. */
function grouped(value: number): string {
  return Math.round(value).toLocaleString()
}

/**
 * Hours to one decimal below ten, whole above.
 *
 * "3.5 hours" is useful and "127.4 hours" is noise; at that size the tenth is beneath
 * notice and the extra glyph costs layout on a 360dp screen.
 */
function hours(value: number): string {
  if (value === 0) return '0'
  return value < 10 ? value.toFixed(1) : grouped(value)
}

export function YearTotals({ summary }: Props) {
  const c = useColors()

  const cells: { label: string; value: string }[] = [
    { label: summary.books === 1 ? 'book' : 'books', value: grouped(summary.books) },
    { label: summary.pages === 1 ? 'page' : 'pages', value: grouped(summary.pages) },
    { label: summary.hours === 1 ? 'hour' : 'hours', value: hours(summary.hours) },
  ]

  return (
    <View style={styles.row}>
      {cells.map((cell) => (
        <View
          key={cell.label}
          accessible
          accessibilityLabel={`${cell.value} ${cell.label}`}
          style={styles.cell}
        >
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            // `display`, not `displayLg`: three of these sit in a row, and the timer's 68px
            // clock has one screen to itself. At 200% font `displayLg` would not fit three
            // across a 360dp screen.
            style={[typeStyle(font.display), { color: c.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {cell.value}
          </Text>
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.secondary), { color: c.textMuted }]}
          >
            {cell.label}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.row },
  cell: { flex: 1, gap: space.labelGap },
})
