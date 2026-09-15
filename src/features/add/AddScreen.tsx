/**
 * Add a book, from `AddBook.dc.html` and the States sheet (04-SCREENS, Journey D).
 *
 * - **Search both databases as you type**, debounced, results arriving as each answers
 *   (hooks/useBookSearch.ts). Every rule about what is shown is in `searchMerge.ts` and
 *   `searchStatus.ts`, tested.
 * - **Add manually is always visible**, in the results and without them, online and offline
 *   (04-SCREENS: "not only in the empty state"). Bad metadata is the median case.
 * - **Offline is a banner, not an error**, and books searched before are still found.
 * - **A result already in the library opens that book** instead of adding a second copy.
 * - **After adding, book detail opens**, where Log pages is one tap away.
 *
 * Not built, deliberately: the design's barcode button (no scanner in this slice, and a button
 * that does nothing is worse than none), and "More editions" (each result is already an edition
 * or a work; grouping editions needs data neither API returns reliably). Both in DECISIONS.md.
 */

import { FlashList } from '@shopify/flash-list'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { AddStatus } from './bookForm'
import { ResultRow } from './components/ResultRow'
import { ShelfPickerSheet } from './components/ShelfPickerSheet'
import { MIN_TERM_LENGTH, useBookSearch } from './hooks/useBookSearch'
import { addFromSearch, getLibraryRefs } from './queries'
import { findInLibrary, type LibraryBookRef, type SearchResult } from './searchMerge'
import { errors, nav } from '@/lib/strings'
import { appError, ok, type Result } from '@/lib/result'
import { Button } from '@/ui/Button'
import { Header } from '@/ui/Header'
import { InlineError } from '@/ui/InlineError'
import { OfflineBanner } from '@/ui/OfflineBanner'
import { Screen } from '@/ui/Screen'
import { SearchField } from '@/ui/SearchField'
import { font, radius, rules, space, typeStyle } from '@/ui/theme'
import { usePressGuard } from '@/ui/usePressGuard'
import { useReloadOnChange } from '@/ui/useReloadOnChange'
import { useColors } from '@/ui/useTheme'

export function AddScreen() {
  const c = useColors()
  const router = useRouter()
  const params = useLocalSearchParams<{ q?: string }>()
  const handed = typeof params.q === 'string' ? params.q : ''
  const [typed, setTyped] = useState(handed)
  // A query handed over from Search your library, while this tab is already mounted. Adjusted
  // during render, React's pattern for state that follows a prop; it fills the field and decides
  // nothing about what is shown (06-CONVENTIONS).
  const [lastHanded, setLastHanded] = useState(handed)
  if (handed !== lastHanded) {
    setLastHanded(handed)
    if (handed.length > 0) setTyped(handed)
  }
  const [picking, setPicking] = useState<SearchResult | null>(null)
  const [library, setLibrary] = useState<readonly LibraryBookRef[]>([])
  const search = useBookSearch(typed)

  const loadLibrary = useCallback(() => {
    void getLibraryRefs()
      .then(setLibrary)
      .catch(() => setLibrary([]))
  }, [])
  useEffect(loadLibrary, [loadLibrary])
  useReloadOnChange(loadLibrary)

  const go = usePressGuard(
    useCallback(
      (to: 'book' | 'manual', id?: string) =>
        to === 'book' && id
          ? router.push({ pathname: '/book/[id]', params: { id } })
          : router.push({ pathname: '/book/new', params: { title: typed.trim() } }),
      [router, typed],
    ),
  )
  const openBook = useCallback((id: string) => go('book', id), [go])
  const addManually = useCallback(() => go('manual'), [go])
  const startAdd = usePressGuard(useCallback((r: SearchResult) => setPicking(r), []))

  const pick = useCallback(
    async (result: SearchResult, status: AddStatus): Promise<Result<unknown>> => {
      const added = await addFromSearch(result, status)
      if (!added.ok) return added
      setPicking(null)
      router.push({ pathname: '/book/[id]', params: { id: added.value.bookId } })
      // "I already finished it": the book is on Finished with no date yet. The finish flow opens
      // over its detail to ask for a rating and the date; closing it leaves the book as added.
      if (status === 'finished') {
        router.push({ pathname: '/book/finish', params: { read: added.value.readId } })
      }
      return ok(undefined)
    },
    [router],
  )

  const inLibrary = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const r of search.results) map.set(r.key, findInLibrary(r, library))
    return map
  }, [search.results, library])

  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => (
      <ResultRow
        result={item}
        inLibrary={inLibrary.get(item.key) ?? null}
        onAdd={startAdd}
        onOpen={openBook}
      />
    ),
    [inLibrary, startAdd, openBook],
  )

  const { status } = search
  const searching = search.term.length >= MIN_TERM_LENGTH
  const noResults =
    searching && search.results.length === 0 && status.progress === null && !status.unavailable

  const header = (
    <View style={styles.top}>
      <SearchField
        value={typed}
        onChangeText={setTyped}
        label="Search for a book"
        placeholder="Title, author or ISBN"
      />
      {status.offline ? (
        <OfflineBanner
          detail={
            status.fromCache
              ? 'Showing books you searched for before. Add manually always works.'
              : 'Search needs a connection. Add manually always works.'
          }
        />
      ) : null}
      {status.progress ? (
        <Text
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.label), { color: c.textMuted }]}
        >
          {status.progress}
        </Text>
      ) : null}
      {status.unavailable ? (
        <InlineError
          error={appError('recoverable', errors.searchUnavailable.message, {
            safe: errors.searchUnavailable.safe,
          })}
          onRetry={search.retry}
        />
      ) : null}
      {status.partial ? (
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.label), { color: c.textMuted }]}
        >
          {status.partial}
        </Text>
      ) : null}
      {noResults ? (
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.body), { color: c.textSecondary }]}
        >
          {status.offline
            ? `Nothing you searched for before matches “${search.term}”.`
            : `No books found for “${search.term}”.`}
        </Text>
      ) : null}
      {!searching ? (
        <View style={styles.intro}>
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.body), { color: c.textMuted }]}
          >
            Searches Google Books and Open Library. Already own it? Search your library instead.
          </Text>
          <Button
            label="Search your library"
            variant="secondary"
            onPress={() => router.push('/search')}
          />
        </View>
      ) : null}
    </View>
  )

  const footer = (
    <View style={styles.footer}>
      <View style={[styles.hatch, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.bodyStrong), { color: c.text }]}
        >
          {searching ? 'Not the edition you’re holding?' : 'Know exactly what you’re reading?'}
        </Text>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.secondary), { color: c.textMuted }]}
        >
          Book databases are incomplete. Add it yourself and set your own page count. It works
          exactly the same everywhere else.
        </Text>
        <Button label="Add manually" variant="secondary" onPress={addManually} />
      </View>
    </View>
  )

  return (
    <Screen padded={false} above="tabBar">
      <View style={styles.head}>
        <Header title={nav.add.title} />
      </View>
      <FlashList
        data={search.results}
        renderItem={renderItem}
        keyExtractor={(r) => r.key}
        extraData={inLibrary}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ItemSeparatorComponent={RowGap}
        contentContainerStyle={styles.list}
      />
      <ShelfPickerSheet result={picking} onClose={() => setPicking(null)} onPick={pick} />
    </Screen>
  )
}

function RowGap() {
  return <View style={styles.gap} />
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.screen },
  list: { paddingHorizontal: space.screen, paddingBottom: space.section },
  top: { gap: space.cardTight, paddingBottom: space.cardTight },
  intro: { gap: space.cardTight },
  hatch: {
    gap: space.stackTight,
    padding: space.card,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  footer: { paddingTop: space.section },
  gap: { height: space.row },
})
