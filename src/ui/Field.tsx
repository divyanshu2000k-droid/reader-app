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

import { font, radius, size } from './theme'
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
  error?: string
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
      <Text style={{ color: c.textMuted, fontSize: font.label.size, fontWeight: '500' }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textFaint}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            minHeight: multiline ? size.field * 2 : size.field,
            borderRadius: radius.field,
            color: c.text,
            fontSize: font.heading.size + 1,
            backgroundColor: error
              ? c.dangerSurface
              : focused
                ? c.accentSurface
                : c.surface,
            borderColor: error ? c.dangerBorder : focused ? c.accentBorder : c.border,
            textAlignVertical: multiline ? 'top' : 'center',
          },
        ]}
      />
      {error ? (
        <Text style={{ color: c.danger, fontSize: font.label.size }}>{error}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: { borderWidth: 1, paddingHorizontal: 17, paddingVertical: 12, fontWeight: '600' },
})
