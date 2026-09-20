/**
 * What the reader read, by genre. Horizontal bars, commonest first.
 *
 * ─── BARS RATHER THAN A PIE ──────────────────────────────────────────────────
 *
 * A pie chart needs a legend, cannot be read by a screen reader without one, and is
 * unreadable at 360dp once there are more than four slices. A labelled bar is its own
 * legend, stacks vertically, and grows a scrollbar instead of becoming illegible.
 *
 * ─── AND WHY IT SAYS WHERE THE GENRES CAME FROM ──────────────────────────────
 *
 * They are GUESSED from whatever the book source happened to say, and the guessing is
 * imperfect by construction — the raw data includes "Dwellings", "Indonesia" and
 * "Accessible book". A chart that presents a guess with no hint that it is one invites the
 * reader to conclude the app is wrong about their library rather than that it is
 * correctable. So the caption says so and points at the fix, which is Edit details.
 */

import { StyleSheet, Text, View } from 'react-native'

import { genreShare, type GenreTally } from '@/domain/genre'
import { font, radius, rules, size, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  tallies: readonly GenreTally[]
  /** Books counted in the breakdown. The denominator for every bar. */
  total: number
}

export function GenreBreakdown({ tallies, total }: Props) {
  const c = useColors()

  return (
    <View style={styles.list}>
      {tallies.map((tally) => {
        const share = genreShare(tally, total)
        return (
          <View
            key={tally.genre}
            accessible
            accessibilityLabel={`${tally.genre}, ${tally.books} ${
              tally.books === 1 ? 'book' : 'books'
            }`}
            style={styles.row}
          >
            <View style={styles.labelRow}>
              <Text
                maxFontSizeMultiplier={rules.maxFontScale}
                numberOfLines={1}
                style={[typeStyle(font.body), styles.name, { color: c.text }]}
              >
                {tally.genre}
              </Text>
              <Text
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.secondary), { color: c.textMuted }]}
              >
                {tally.books}
              </Text>
            </View>
            <View style={[styles.track, { backgroundColor: c.surface }]}>
              <View
                style={[
                  styles.fill,
                  {
                    // A genre with books is never drawn as nothing, however small beside the
                    // biggest: the same rule the pace chart's bars follow.
                    width: `${Math.max(share * 100, tally.books > 0 ? 2 : 0)}%`,
                    backgroundColor: c.accentInk,
                  },
                ]}
              />
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.row },
  row: { gap: space.labelGap },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.labelGap },
  name: { flexShrink: 1 },
  track: {
    height: size.genreBar,
    borderRadius: radius.skeleton,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.skeleton },
})
