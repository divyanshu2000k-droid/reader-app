/**
 * src/ui/Segmented.tsx
 *
 * Segmented control h48 r15, 4px inner padding, 12px inner radius. This is the Pages /
 * Minutes toggle on the log-session screen, which is feature 3 in the product doc, so
 * it is a load-bearing control rather than a nicety.
 *
 * Generic over the option value so the caller keeps its union type.
 */

import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { font, radius, rules, size, space, typeStyle } from './theme'
import { useColors } from './useTheme'

interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  options: readonly Option<T>[]
  value: T
  onChange: (v: T) => void
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
}: Props<T>) {
  const c = useColors()

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: c.surface, borderColor: c.border }, style]}
    >
      {options.map((o) => {
        const selected = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[
              styles.segment,
              { backgroundColor: selected ? c.surfaceRaised : 'transparent' },
            ]}
          >
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[
                typeStyle(selected ? font.segmentSelected : font.segment),
                { color: selected ? c.text : c.textMuted },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: space.segmentPad,
    padding: space.segmentPad,
    borderRadius: radius.segment,
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    minHeight: size.minTouch,
    paddingVertical: space.labelGap,
    borderRadius: radius.segmentInner,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
