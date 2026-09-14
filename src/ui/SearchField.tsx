/**
 * src/ui/SearchField.tsx
 *
 * The search box from AddBook.dc.html and LibrarySearch.dc.html: a magnifier, the query, and a
 * clear button once there is something to clear. Its label is for TalkBack; the visible hint is
 * the placeholder, in `textMuted`, because a placeholder is text (06-CONVENTIONS, contrast).
 */

import { forwardRef } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'

import { Icon } from './Icon'
import { font, iconSize, radius, rules, size, space, typeStyle } from './theme'
import { useColors } from './useTheme'

interface Props {
  value: string
  onChangeText: (text: string) => void
  label: string
  placeholder: string
  autoFocus?: boolean
  onSubmit?: () => void
}

export const SearchField = forwardRef<TextInput, Props>(function SearchField(
  { value, onChangeText, label, placeholder, autoFocus, onSubmit },
  ref,
) {
  const c = useColors()
  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: c.accentSurface,
          borderColor: c.accentBorder,
          borderRadius: radius.field,
        },
      ]}
    >
      <Icon name="search" size={iconSize.header} color={c.accentInk} />
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.bodyStrong), styles.input, { color: c.text }]}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={size.hitSlop}
          onPress={() => onChangeText('')}
          style={[styles.clear, { backgroundColor: c.surfaceRaised }]}
        >
          <Icon name="close" size={iconSize.header} color={c.textMuted} />
        </Pressable>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  field: {
    minHeight: size.field,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.stackTight,
    paddingHorizontal: space.fieldPadX,
    borderWidth: 1,
  },
  input: { flex: 1, paddingVertical: space.fieldPadY },
  clear: {
    width: size.iconButton,
    height: size.iconButton,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
