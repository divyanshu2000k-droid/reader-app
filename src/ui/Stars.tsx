/**
 * src/ui/Stars.tsx
 *
 * A read's rating, 0.5 to 5 in half steps, drawn as five stars. Display only: rating is set
 * in the finish flow (Slice 5).
 *
 * Half stars are a clip over a filled star, with a CLIP ID PER INSTANCE. SVG ids are global
 * to the document, which is the bug `ScreenGlow` shipped with: two ratings on one screen
 * (book detail shows the current read and every previous one) would share one clip and draw
 * each other's halves. Same fix, applied before it could happen here.
 *
 * The number is read out, not the shapes: "Rated 4.5 out of 5".
 */

import { useId } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg'

import { iconSize, space } from './theme'
import { useColors } from './useTheme'

const STAR = 'M12 2l3 6.5 7 .9-5 4.9 1.2 7L12 18l-6.2 3.3L7 14.3l-5-4.9 7-.9z'

export function Stars({ rating }: { rating: number }) {
  const c = useColors()
  const base = useId().replace(/[^a-zA-Z0-9]/g, '')

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Rated ${rating} out of 5`}
      style={styles.row}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        // 1, 0.5 or 0 of this star, from the rating.
        const fill = Math.max(0, Math.min(1, rating - i))
        const clipId = `star${base}${i}`
        return (
          <Svg key={i} width={iconSize.star} height={iconSize.star} viewBox="0 0 24 24">
            <Defs>
              <ClipPath id={clipId}>
                <Rect x="0" y="0" width={24 * fill} height="24" />
              </ClipPath>
            </Defs>
            {/* The empty star is decoration; the filled part and the label carry the value. */}
            <Path d={STAR} fill={c.textGhost} />
            {fill > 0 ? (
              <Path d={STAR} fill={c.accentInk} clipPath={`url(#${clipId})`} />
            ) : null}
          </Svg>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.labelGap },
})
