/**
 * src/ui/Field.tsx
 *
 * Field h54 r16, rest and focused. Focused gets the accent wash and border.
 *
 * The label is a real `<Text>` above the input rather than a placeholder, because a
 * placeholder disappears the moment you type and leaves a screen of unlabelled boxes
 * for anyone using TalkBack.
 */

import { useState } from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { font, radius, rules, size, space, typeStyle } from './theme'
import { useColors } from './useTheme'

interface Props {
  label: string
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  keyboardType?: KeyboardTypeOptions
  autoFocus?: boolean
  multiline?: boolean
  /** Inline error. Says what happened; the caller supplies what is still safe. */
  error?: string | undefined
  style?: StyleProp<ViewStyle>
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
  multiline = false,
  error,
  style,
}: Props) {
  const c = useColors()
  const [focused, setFocused] = useState(false)

  return (
    <View style={[styles.wrap, style]}>
      <Text
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.label), { color: c.textMuted }]}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        // Placeholder text is text: WCAG holds it to 4.5:1, which only textMuted meets.
        placeholderTextColor={c.textMuted}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        multiline={multiline}
        maxFontSizeMultiplier={rules.maxFontScale}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          typeStyle(font.input),
          {
            minHeight: multiline ? size.fieldMultiline : size.field,
            borderRadius: radius.field,
            color: c.text,
            backgroundColor: error ? c.dangerSurface : focused ? c.accentSurface : c.surface,
            borderColor: error ? c.dangerBorder : focused ? c.accentBorder : c.border,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
      {error ? (
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.label), { color: c.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.labelGap },
  input: {
    borderWidth: 1,
    paddingHorizontal: space.fieldPadX,
    paddingVertical: space.fieldPadY,
  },
})
