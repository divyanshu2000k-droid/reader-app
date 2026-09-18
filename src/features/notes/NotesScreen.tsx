/**
 * Notes and quotes for one book, from `Notes.dc.html` (04-SCREENS, Journey G).
 *
 * - **One FlashList**, because a reader who annotates heavily has hundreds of notes on one
 *   book.
 * - **The counts are of the book, not of the filter** (`noteList.ts`), so tapping Quotes does
 *   not change the number the reader was just reading.
 * - **Export shares what is on screen**, with the filter named in the subject.
 * - **No delete here.** Deleting from a list raises the undo toast beneath whatever confirmed
 *   it; the editor owns delete, with the pattern Slice 3 proved.
 */

import { FlashList } from '@shopify/flash-list'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { Share, StyleSheet, Text, View } from 'react-native'

import { NoteCard } from './components/NoteCard'
import { useBookNotes } from './hooks/useBookNotes'
import { exportNotes } from './noteExport'
import { FILTERS, countNotes, filterLabel, filterNotes, type NoteFilter } from './noteList'
import type { NoteEntry } from './queries'
import { countsLine } from '@/domain/noteLine'
import { formatRelativeDay } from '@/lib/dates'
import { appError, type AppError } from '@/lib/result'
import { empty } from '@/lib/strings'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { EmptyState } from '@/ui/EmptyState'
import { Header, HeaderIconButton } from '@/ui/Header'
import { InlineError } from '@/ui/InlineError'
import { Screen } from '@/ui/Screen'
import { SkeletonBookRow, SkeletonGate } from '@/ui/Skeleton'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { usePressGuard } from '@/ui/usePressGuard'
import { useColors } from '@/ui/useTheme'

const NO_NOTES: readonly NoteEntry[] = []

export function NotesScreen() {
  const c = useColors()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const bookId = typeof id === 'string' ? id : ''
  const { data, error, reload } = useBookNotes(bookId)
  const [filter, setFilter] = useState<NoteFilter>('all')
  const [shareError, setShareError] = useState<AppError | null>(null)

  const back = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }, [router])

  const all = data?.notes ?? NO_NOTES
  const counts = useMemo(() => countNotes(all), [all])
  const shown = useMemo(() => filterNotes(all, filter), [all, filter])

  const openNote = usePressGuard(
    useCallback(
      (noteId: string) => router.push({ pathname: '/book/note', params: { note: noteId } }),
      [router],
    ),
  )
  const addNote = usePressGuard(
    useCallback(
      () => router.push({ pathname: '/book/note', params: { book: bookId } }),
      [router, bookId],
    ),
  )

  const renderItem = useCallback(
    ({ item }: { item: NoteEntry }) => <NoteCard note={item} onOpen={openNote} />,
    [openNote],
  )
  const keyExtractor = useCallback((item: NoteEntry) => item.id, [])

  async function share() {
    if (!data) return
    const text = exportNotes(
      data.book,
      shown.map((n) => ({
        type: n.type,
        content: n.content,
        page: n.page,
        when: formatRelativeDay(n.createdAt),
      })),
      filter,
    )
    // Never a chooser over an empty string: the reader picks an app and nothing arrives.
    if (text === null) return
    setShareError(null)
    try {
      await Share.share({ message: text.body, title: text.subject }, { subject: text.subject })
    } catch (cause) {
      // Android refuses a payload past its transaction limit. It fails here, out loud,
      // rather than being silently cut short: half an export that looks whole is worse.
      setShareError(
        appError('recoverable', 'Could not share those notes', {
          safe: 'Your notes are safe. Try one filter at a time, or share fewer at once.',
          cause,
        }),
      )
    }
  }

  return (
    <Screen padded={false}>
      <View style={styles.head}>
        <Header
          compact
          title="Notes & quotes"
          left={<HeaderIconButton icon="back" accessibilityLabel="Back" onPress={back} />}
          right={
            data ? (
              <HeaderIconButton icon="plus" accessibilityLabel="Add a note" onPress={addNote} />
            ) : undefined
          }
        />
        {error ? <InlineError error={error} onRetry={reload} /> : null}
      </View>

      <SkeletonGate
        loading={data === undefined && error === null}
        fallback={
          <View style={styles.head}>
            <SkeletonBookRow />
          </View>
        }
      >
        {data === null ? (
          <EmptyState
            title="This book is not in your library"
            body="It may have been removed. Anything removed waits in Recently Deleted for 30 days."
            actionLabel="Back to the library"
            onAction={back}
          />
        ) : data ? (
          <>
            <View style={styles.head}>
              <Text
                accessibilityRole="header"
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.bodyStrong), { color: c.text }]}
              >
                {data.book.title}
              </Text>
              {counts.total > 0 ? (
                <>
                  <Text
                    maxFontSizeMultiplier={rules.maxFontScale}
                    style={[typeStyle(font.secondary), { color: c.textMuted }]}
                  >
                    {countsLine(counts)}
                  </Text>
                  <View style={styles.chips}>
                    {FILTERS.map((f) => (
                      <Chip
                        key={f}
                        label={filterLabel(f, counts)}
                        selected={f === filter}
                        accessibilityLabel={`Show ${filterLabel(f, counts)}`}
                        onPress={() => setFilter(f)}
                      />
                    ))}
                  </View>
                </>
              ) : null}
              {shareError ? <InlineError error={shareError} /> : null}
            </View>

            {counts.total === 0 ? (
              <EmptyState
                title={empty.notes.title}
                body={empty.notes.body}
                actionLabel={empty.notes.action}
                onAction={addNote}
              />
            ) : shown.length === 0 ? (
              // A filter with nothing in it is not an empty book, and must not say so.
              <EmptyState
                title={filter === 'quote' ? 'No quotes yet' : 'No notes yet'}
                body={
                  filter === 'quote'
                    ? 'Quotes you save from this book collect here.'
                    : 'Thoughts you write about this book collect here.'
                }
              />
            ) : (
              <>
                <FlashList
                  // One list per filter, so All and Quotes do not share a scroll offset:
                  // tapping Quotes after scrolling All opened it hundreds of rows down
                  // (the same fault the Library tabs had, Slice 2).
                  key={filter}
                  data={shown}
                  renderItem={renderItem}
                  keyExtractor={keyExtractor}
                  contentContainerStyle={styles.listContent}
                  ItemSeparatorComponent={RowGap}
                />
                <View style={styles.footer}>
                  <Button
                    label="Export these notes"
                    variant="secondary"
                    onPress={() => void share()}
                  />
                  <Text
                    maxFontSizeMultiplier={rules.maxFontScale}
                    style={[typeStyle(font.label), styles.privacy, { color: c.textMuted }]}
                  >
                    Notes are private to you unless you share one yourself.
                  </Text>
                </View>
              </>
            )}
          </>
        ) : null}
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
  head: { paddingHorizontal: space.screen, gap: space.labelGap },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.row, paddingTop: space.labelGap },
  listContent: {
    paddingHorizontal: space.screen,
    paddingTop: space.row,
    paddingBottom: space.row,
  },
  footer: { paddingHorizontal: space.screen, paddingTop: space.row, gap: space.stackTight },
  privacy: { textAlign: 'center' },
})
