/**
 * What the book is about, and "Read a sample" (Slice 5, owner's addition, DECISIONS.md 2026-09-14).
 *
 * - **A short summary, expandable.** Five lines until More. Nothing at all when there is no
 *   description and no preview: an empty card is a promise with nothing behind it.
 * - **"Read a sample" opens Google's preview page in the browser**, shown only when Google said
 *   some pages can be read. Reading it inside the app is Slice 11 (the Embedded Viewer API).
 * - **Offline**, the description is local and shows. The link still needs a network, and the
 *   browser says so itself.
 */

import { useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/ui/Button'
import { font, radius, rules, space, typeStyle } from '@/ui/theme'
import { usePressGuard } from '@/ui/usePressGuard'
import { useColors } from '@/ui/useTheme'

/** Lines shown before More. */
const COLLAPSED_LINES = 5

/** Below this, five lines hold it on any phone we support, so More would reveal nothing. */
const SHORT_DESCRIPTION = 220

interface Props {
  description: string | null
  previewUrl: string | null
}

export function AboutCard({ description, previewUrl }: Props) {
  const c = useColors()
  const [expanded, setExpanded] = useState(false)
  const openSample = usePressGuard(() => {
    if (previewUrl !== null) void Linking.openURL(previewUrl).catch(() => undefined)
  })

  if (description === null && previewUrl === null) return null
  const long = description !== null && description.length > SHORT_DESCRIPTION

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      {description !== null ? (
        <>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.label), { color: c.textMuted }]}
          >
            ABOUT THIS BOOK
          </Text>
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            numberOfLines={long && !expanded ? COLLAPSED_LINES : undefined}
            style={[typeStyle(font.body), { color: c.textSecondary }]}
          >
            {description}
          </Text>
          {long ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                expanded ? 'Show less of the description' : 'Show all of the description'
              }
              hitSlop={space.row}
              onPress={() => setExpanded((e) => !e)}
              style={styles.more}
            >
              <Text
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.label), { color: c.accentInk }]}
              >
                {expanded ? 'Less' : 'More'}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
      {previewUrl !== null ? (
        <Button
          label="Read a sample"
          variant="secondary"
          accessibilityLabel="Read a sample. Opens Google Books in your browser"
          onPress={openSample}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.row, padding: space.cardTight, borderWidth: 1, borderRadius: radius.card },
  more: { alignSelf: 'flex-start' },
})
