/**
 * The Library tab: the screen a reader opens the app to see.
 *
 * From `Main.dc.html`. FlashList from the first row, because an importer arrives with 500
 * to 2000 books and FlatList does not survive that (02-ARCHITECTURE).
 *
 * ─── WHAT IS HERE, AND WHAT WAITS FOR THE SLICE THAT OWNS IT ─────────────────
 *
 * The artboard also shows a Discover/My books toggle, a search field, a stats strip and the
 * "pick up where you left off" dock. Each of those opens something that does not exist yet:
 * search and Discover belong to Slice 4's add-a-book flow, the dock's button starts the
 * timer (Slice 6), and the strip is the Stats screen's numbers (Slice 7). Rendering them
 * now would mean four controls that go nowhere, which is worse than four controls that
 * arrive with their destination. Filed in `05-BUILD-PLAN.md`.
 *
 * No loading spinner over the reader's own data (rule 1): skeleton rows appear only if the
 * read takes longer than 400ms, which `SkeletonGate` enforces.
 */

import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { BookRow } from './components/BookRow'
import { StatusTabs } from './components/StatusTabs'
import { useLibraryRows } from './hooks/useLibraryRows'
import type { LibraryRow } from './queries'
import type { ReadStatus } from '@/db/schema'
import { empty, nav } from '@/lib/strings'
import { EmptyState } from '@/ui/EmptyState'
import { Header, HeaderIconButton } from '@/ui/Header'
import { InlineError } from '@/ui/InlineError'
import { Screen } from '@/ui/Screen'
import { SkeletonBookRow, SkeletonGate } from '@/ui/Skeleton'
import { usePressGuard } from '@/ui/usePressGuard'
import { space } from '@/ui/theme'

const EMPTY_ROWS: readonly LibraryRow[] = []

/** Enough skeletons to fill a phone, so the list does not appear to jump on load. */
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5]

export function LibraryScreen() {
  const router = useRouter()
  const [status, setStatus] = useState<ReadStatus>('reading')
  const { rows, libraryEmpty, error, reload } = useLibraryRows(status)

  const push = useCallback(
    (to: 'book' | 'log', bookId: string) =>
      to === 'book'
        ? router.push({ pathname: '/book/[id]', params: { id: bookId } })
        : router.push({ pathname: '/session/log', params: { book: bookId } }),
    [router],
  )
  // A quick double tap on a row opened book detail twice, and Back then took two taps. One
  // guard for the whole list, rows and Continue pills alike, so a tap on a row and a tap on
  // its pill cannot push two screens either.
  const go = usePressGuard(push)
  const openBook = useCallback((bookId: string) => go('book', bookId), [go])
  const continueBook = useCallback((bookId: string) => go('log', bookId), [go])
  // Stable identities: FlashList recycles rows, and a new function every render defeats
  // the memo on BookRow.
  const renderItem = useCallback(
    ({ item }: { item: LibraryRow }) => (
      <BookRow row={item} onOpen={openBook} onContinue={continueBook} />
    ),
    [openBook, continueBook],
  )
  const keyExtractor = useCallback((item: LibraryRow) => item.readId, [])

  return (
    <Screen padded={false}>
      <View style={styles.head}>
        <Header
          title={nav.library.title}
          right={
            <HeaderIconButton
              icon="settings"
              accessibilityLabel={nav.settings.title}
              onPress={() => router.push('/settings')}
            />
          }
        />
        <StatusTabs value={status} onChange={setStatus} />
        {error ? (
          <View style={styles.error}>
            <InlineError error={error} onRetry={reload} />
          </View>
        ) : null}
      </View>

      <SkeletonGate
        // Not while an error is showing: skeleton rows under "Could not open your library"
        // said it was still loading, forever. Seen with the forced failure, Slice 3.
        loading={rows === null && error === null}
        fallback={
          <View style={styles.list}>
            {SKELETON_ROWS.map((i) => (
              <SkeletonBookRow key={i} />
            ))}
          </View>
        }
      >
        {rows && rows.length === 0 ? (
          libraryEmpty ? (
            <EmptyState
              title={empty.library.title}
              body={empty.library.body}
              actionLabel={empty.library.action}
              onAction={() => router.navigate('/add')}
            />
          ) : (
            <EmptyState title={empty.tab[status].title} body={empty.tab[status].body} />
          )
        ) : (
          <FlashList
            // One list per tab. Without this, switching tabs kept the previous tab's scroll
            // offset: after scrolling Finished, Reading opened hundreds of rows down, and on
            // the phone the "first" row sat clipped under the chips.
            key={status}
            data={rows ?? EMPTY_ROWS}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            // Rows are cards, and cards touch without this: FlashList has no `gap`, and
            // the first phone screenshot showed every border fused to the next.
            ItemSeparatorComponent={RowGap}
            // FlashList v2 sizes itself; `estimatedItemSize` is deprecated there and
            // passing it does nothing (Callstack's list guidance, version guardrail).
          />
        )}
      </SkeletonGate>
    </Screen>
  )
}

/** Module scope, so FlashList receives the same component every render. */
function RowGap() {
  return <View style={styles.gap} />
}

const styles = StyleSheet.create({
  gap: { height: space.row },
  head: { paddingHorizontal: space.screen },
  error: { paddingBottom: space.row },
  list: { paddingHorizontal: space.screen, gap: space.row, paddingTop: space.row },
  listContent: { paddingHorizontal: space.screen, paddingTop: space.row },
})
