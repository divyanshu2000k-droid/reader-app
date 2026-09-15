/**
 * src/ui/RatingInput.tsx
 *
 * Setting a rating, from `FinishBook.dc.html`: five stars, "Tap the left or right half of a star
 * for half ratings". Display-only ratings are `Stars`.
 *
 * - **Each star is a minTouch-wide target**, split down the middle. The drawn star is smaller
 *   than its target, so half a star is still a thumb's width, not 17 dp.
 * - **Tapping the rating already shown clears it.** A rating is optional (`ratingFromTap`).
 * - **TalkBack hears one adjustable control**, "Rating, 4.5 out of 5", and swipes up or down
 *   to change it by half a star. Five separate buttons with halves nobody can see would be
 *   ten unlabelled targets.
 *
 * The rules are the caller's (pure, and tested): this component only reports which half of
 * which star was pressed, and which way TalkBack stepped.
 */

import { useId } from 'react'
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native'
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg'

import { iconSize, size } from './theme'
import { useColors } from './useTheme'

const STAR = 'M12 2l3 6.5 7 .9-5 4.9 1.2 7L12 18l-6.2 3.3L7 14.3l-5-4.9 7-.9z'

interface Props {
  rating: number | null
  onTap: (index: number, leftHalf: boolean) => void
  onStep: (direction: 1 | -1) => void
}

export function RatingInput({ rating, onTap, onStep }: Props) {
  const c = useColors()
  const base = useId().replace(/[^a-zA-Z0-9]/g, '')

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Rating"
      accessibilityValue={{ text: rating === null ? 'Not rated' : `${rating} out of 5` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onStep(1)
        if (e.nativeEvent.actionName === 'decrement') onStep(-1)
      }}
      style={styles.row}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = rating === null ? 0 : Math.max(0, Math.min(1, rating - i))
        const clipId = `rate${base}${i}`
        return (
          <Pressable
            key={i}
            importantForAccessibility="no"
            onPress={(e: GestureResponderEvent) =>
              onTap(i, e.nativeEvent.locationX < size.ratingHalf)
            }
            style={styles.target}
          >
            <Svg width={iconSize.ratingInput} height={iconSize.ratingInput} viewBox="0 0 24 24">
              <Defs>
                <ClipPath id={clipId}>
                  <Rect x="0" y="0" width={24 * fill} height="24" />
                </ClipPath>
              </Defs>
              <Path d={STAR} fill={c.textGhost} />
              {fill > 0 ? <Path d={STAR} fill={c.accent} clipPath={`url(#${clipId})`} /> : null}
            </Svg>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center' },
  target: {
    width: size.minTouch,
    height: size.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
