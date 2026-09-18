/**
 * One row of the notes list, from `Notes.dc.html`: the badge, when it was written, and the
 * words. A quote is set a size larger, in the brighter ink, under an accent badge.
 *
 * **Not in italic, although the artboard is.** Only the five upright weights of the typeface
 * are embedded (`src/ui/brand.json`), so `fontStyle: 'italic'` on Android resolves to nothing
 * and renders upright with no error — the same silent shape as the app spending a week in
 * Roboto. Adding an italic file is a native rebuild for one row's styling. See DECISIONS.md.
 *
 * The whole card opens the editor. There is no delete here: deleting from a list would raise
 * the undo toast beneath whatever confirmed it, and the editor already owns delete with the
 * pattern that works (Slice 3).
 */

import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { noteAnnouncement, noteBadge, type ListedNote } from '../noteList'
import { formatRelativeDay } from '@/lib/dates'
import { font, motion, radius, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  note: ListedNote
  onOpen: (noteId: string) => void
}

function NoteCardView({ note, onOpen }: Props) {
  const c = useColors()
  const when = formatRelativeDay(note.createdAt)
  const quote = note.type === 'quote'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${noteAnnouncement(note, when)}. ${note.content}`}
      accessibilityHint="Opens this note to edit it"
      onPress={() => onOpen(note.id)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.surface, borderColor: c.border, borderRadius: radius.card },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.head}>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.noteBadge), { color: quote ? c.accentInk : c.textMuted }]}
        >
          {noteBadge(note)}
        </Text>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.caption), { color: c.textMuted }]}
        >
          {when}
        </Text>
      </View>
      <Text
        maxFontSizeMultiplier={rules.maxFontScale}
        // A note can run a page. The list shows enough to recognise it; the editor shows all
        // of it, rather than one note filling the screen.
        numberOfLines={rules.noteLines}
        style={[
          typeStyle(quote ? font.quote : font.body),
          { color: quote ? c.text : c.textSecondary },
        ]}
      >
        {note.content}
      </Text>
    </Pressable>
  )
}

export const NoteCard = memo(NoteCardView)

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: space.card, gap: space.stackTight },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.row,
  },
  pressed: { transform: [{ scale: motion.press.scale }] },
})
