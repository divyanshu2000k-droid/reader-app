/**
 * Search your library, from `LibrarySearch.dc.html`: separate from searching the internet
 * (05-BUILD-PLAN, Slice 4).
 *
 * - **Instant and offline**: it is the reader's own data, in SQLite, matched in TypeScript so
 *   accents and case do not decide (librarySearch.ts). No debounce spinner over their books.
 * - **Scope chips** narrow by where the book is now. **A result says where it is**: "READING ·
 *   42%", "FINISHED · 2024", "WANT TO READ".
 * - **"Not in your library?"** hands the words to Add a book.
 */

import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { highlight, matchLibrary, statusBadge, type IndexedBook } from './librarySearch'
import { getLibraryIndex, getLibraryRowsFor, type LibraryRow } from './queries'
import type { ReadStatus } from '@/db/schema'
import { progressDisplay } from '@/domain/progressDisplay'
import { appError, type AppError } from '@/lib/result'
import { actions, status as statusCopy } from '@/lib/strings'
import { BookCover } from '@/ui/BookCover'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Icon } from '@/ui/Icon'
import { InlineError } from '@/ui/InlineError'
import { Screen } from '@/ui/Screen'
import { SearchField } from '@/ui/SearchField'
import { font, iconSize, motion, radius, rules, space, typeStyle } from '@/ui/theme'
import { usePressGuard } from '@/ui/usePressGuard'
import { useReloadOnChange } from '@/ui/useReloadOnChange'
import { useColors } from '@/ui/useTheme'

const SCOPES: readonly (ReadStatus | null)[] = [null, 'reading', 'finished', 'want', 'dnf']
const MATCH_LIMIT = 100

export function LibrarySearchScreen() {
  const c = useColors()
  const router = useRouter()
  const [term, setTerm] = useState('')
  const [scope, setScope] = useState<ReadStatus | null>(null)
  const [index, setIndex] = useState<readonly IndexedBook[] | null>(null)
  const [rows, setRows] = useState<LibraryRow[]>([])
  const [error, setError] = useState<AppError | null>(null)

  const loadIndex = useCallback(() => {
    void getLibraryIndex()
      .then((next) => {
        setIndex(next)
        setError(null)
      })
      .catch((cause: unknown) =>
        setError(
          appError('recoverable', 'Could not search your library', {
            safe: 'Nothing was changed.',
            cause,
          }),
        ),
      )
  }, [])
  useEffect(loadIndex, [loadIndex])
  useReloadOnChange(loadIndex)

  const ids = useMemo(
    () => (index ? matchLibrary(index, term, scope, MATCH_LIMIT) : []),
    [index, term, scope],
  )

  useEffect(() => {
    let cancelled = false
    void getLibraryRowsFor(ids)
      .then((next) => !cancelled && setRows(next))
      .catch(() => !cancelled && setRows([]))
    return () => {
      cancelled = true
    }
  }, [ids])

  const go = usePressGuard(
    useCallback(
      (to: 'book' | 'add', id?: string) =>
        to === 'book' && id
          ? router.push({ pathname: '/book/[id]', params: { id } })
          : router.navigate({ pathname: '/add', params: { q: term.trim() } }),
      [router, term],
    ),
  )
  const openBook = useCallback((id: string) => go('book', id), [go])
  const typed = term.trim().length > 0
  const shown = typed ? rows : []

  const renderItem = useCallback(
    ({ item }: { item: LibraryRow }) => <MatchRow row={item} term={term} onOpen={openBook} />,
    [term, openBook],
  )

  return (
    <Screen padded={false}>
      <View style={styles.head}>
        <View style={styles.bar}>
          <View style={styles.fill}>
            <SearchField
              value={term}
              onChangeText={setTerm}
              label="Search your library"
              placeholder="Title or author"
              autoFocus
            />
          </View>
          <Button label={actions.cancel} variant="ghost" onPress={() => router.back()} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scopes}
        >
          {SCOPES.map((s) => (
            <Chip
              key={s ?? 'all'}
              label={s === null ? 'All shelves' : statusCopy[s]}
              selected={scope === s}
              onPress={() => setScope(s)}
            />
          ))}
        </ScrollView>
        {error ? <InlineError error={error} onRetry={loadIndex} /> : null}
        {typed && index ? (
          <Text
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.label), { color: c.textMuted }]}
          >
            {ids.length === 0
              ? 'Nothing in your library matches'
              : `${ids.length === MATCH_LIMIT ? `${MATCH_LIMIT}+` : ids.length} ${ids.length === 1 ? 'book' : 'books'} in your library`}
          </Text>
        ) : null}
      </View>
      <FlashList
        data={shown}
        renderItem={renderItem}
        keyExtractor={(r) => r.readId}
        extraData={term}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={RowGap}
        ListFooterComponent={
          typed ? (
            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Not in your library? Search Google Books and Open Library instead"
                onPress={() => go('add')}
                style={({ pressed }) => [
                  styles.addNew,
                  { backgroundColor: c.surface, borderColor: c.border },
                  pressed && styles.pressed,
                ]}
              >
                <Icon name="plus" size={iconSize.base} color={c.textMuted} />
                <View style={styles.fill}>
                  <Text
                    maxFontSizeMultiplier={rules.maxFontScale}
                    style={[typeStyle(font.bodyStrong), { color: c.text }]}
                  >
                    Not in your library?
                  </Text>
                  <Text
                    maxFontSizeMultiplier={rules.maxFontScale}
                    style={[typeStyle(font.secondary), { color: c.textMuted }]}
                  >
                    Search Google Books and Open Library instead
                  </Text>
                </View>
                <Icon name="chevron" size={iconSize.header} color={c.textFaint} />
              </Pressable>
            </View>
          ) : null
        }
      />
    </Screen>
  )
}

const MatchRow = memo(function MatchRow({
  row,
  term,
  onOpen,
}: {
  row: LibraryRow
  term: string
  onOpen: (bookId: string) => void
}) {
  const c = useColors()
  const badge = statusBadge(
    row.status,
    progressDisplay(row).label,
    row.finishedAt,
    row.lastSessionAt,
  )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[row.title, row.author, badge].filter(Boolean).join(', ')}
      onPress={() => onOpen(row.bookId)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.surface, borderColor: c.border },
        pressed && styles.pressed,
      ]}
    >
      <BookCover
        title={row.title}
        localPath={row.coverLocalPath}
        url={row.coverUrl}
        color={row.coverColor}
        size="list"
      />
      <View style={styles.text}>
        <Highlighted text={row.title} term={term} token={font.bodyStrong} lines={2} />
        {row.author ? (
          <Highlighted text={row.author} term={term} token={font.secondary} lines={1} />
        ) : null}
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[
            typeStyle(font.caption),
            { color: row.status === 'reading' ? c.accentInk : c.textMuted },
          ]}
        >
          {badge}
        </Text>
      </View>
    </Pressable>
  )
})

function Highlighted({
  text,
  term,
  token,
  lines,
}: {
  text: string
  term: string
  token: typeof font.bodyStrong | typeof font.secondary
  lines: number
}) {
  const c = useColors()
  const muted = token === font.secondary
  return (
    <Text
      numberOfLines={lines}
      maxFontSizeMultiplier={rules.maxFontScale}
      style={[typeStyle(token), { color: muted ? c.textMuted : c.text }]}
    >
      {highlight(text, term).map((part, i) => (
        <Text key={i} style={part.match ? { color: c.accentInk } : undefined}>
          {part.text}
        </Text>
      ))}
    </Text>
  )
}

function RowGap() {
  return <View style={styles.gap} />
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { paddingHorizontal: space.screen, paddingTop: space.section, gap: space.cardTight },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.row },
  scopes: { gap: space.row, paddingRight: space.screen },
  list: {
    paddingHorizontal: space.screen,
    paddingTop: space.cardTight,
    paddingBottom: space.section,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.rowWide,
    padding: space.cardTight,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  text: { flex: 1, gap: space.labelGap },
  addNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cardTight,
    padding: space.card,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  footer: { paddingTop: space.section },
  gap: { height: space.row },
  pressed: { transform: [{ scale: motion.press.scale }] },
})
