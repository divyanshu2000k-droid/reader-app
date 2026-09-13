/**
 * Book detail, from `BookDetail.dc.html`: the book, where the reader is in it, this read's
 * sessions, and its earlier reads.
 *
 * One FlashList for the whole screen, with the hero and progress as its header and earlier
 * reads as its footer. A read can have hundreds of sessions, and a ScrollView renders every
 * one of them at once.
 *
 * Removing a book leaves this screen first and raises the undo toast second: the toast lives
 * above the tab bar, and a book detail showing a deleted book with an Undo beneath it would
 * be two answers to one question.
 */

import { FlashList } from '@shopify/flash-list'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { BookActionsSheet } from './components/BookActionsSheet'
import { BookHero } from './components/BookHero'
import { PreviousReads } from './components/PreviousReads'
import { ProgressCard } from './components/ProgressCard'
import { SessionRow } from './components/SessionRow'
import { useBookDetail } from './hooks/useBookDetail'
import {
  removeBook,
  restoreBook,
  setReadStatus,
  startReread,
  type SessionEntry,
} from './queries'
import type { ReadStatus } from '@/db/schema'
import { appError, err, ok } from '@/lib/result'
import { toasts } from '@/lib/strings'
import { EmptyState } from '@/ui/EmptyState'
import { Header, HeaderIconButton } from '@/ui/Header'
import { InlineError } from '@/ui/InlineError'
import { Screen } from '@/ui/Screen'
import { SkeletonBookRow, SkeletonGate } from '@/ui/Skeleton'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useToast } from '@/ui/Toast'
import { useColors } from '@/ui/useTheme'

export function BookDetailScreen() {
  const c = useColors()
  const router = useRouter()
  const toast = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
  const bookId = typeof id === 'string' ? id : ''
  const { detail, sessions, error, reload } = useBookDetail(bookId)
  const [sheetOpen, setSheetOpen] = useState(false)

  const back = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }, [router])

  const renderItem = useCallback(
    ({ item }: { item: SessionEntry }) => <SessionRow session={item} />,
    [],
  )
  const keyExtractor = useCallback((item: SessionEntry) => item.id, [])

  const onMove = useCallback(
    async (status: ReadStatus) => {
      if (!detail) return err(appError('recoverable', 'This book is no longer here'))
      const result = await setReadStatus(detail.current.readId, status)
      reload()
      return result
    },
    [detail, reload],
  )

  const onReread = useCallback(async () => {
    const result = await startReread(bookId)
    reload()
    return result
  }, [bookId, reload])

  const onRemove = useCallback(async () => {
    const result = await removeBook(bookId)
    if (!result.ok) return result
    // `ok` is not "something happened" (write.ts, WriteOutcome). A book already removed
    // from somewhere else gets no toast offering to undo a delete this screen did not do.
    back()
    if (result.value.changed) {
      toast.showUndo(toasts.bookRemoved, () => restoreBook(bookId))
    }
    return ok(undefined)
  }, [back, bookId, toast])

  return (
    <Screen padded={false}>
      <View style={styles.head}>
        <Header
          left={<HeaderIconButton icon="back" accessibilityLabel="Back" onPress={back} />}
          right={
            detail ? (
              <HeaderIconButton
                icon="more"
                accessibilityLabel="Book actions"
                onPress={() => setSheetOpen(true)}
              />
            ) : undefined
          }
        />
        {error ? <InlineError error={error} onRetry={reload} /> : null}
      </View>

      <SkeletonGate
        loading={detail === undefined && error === null}
        fallback={
          <View style={styles.head}>
            <SkeletonBookRow />
          </View>
        }
      >
        {detail === null ? (
          <EmptyState
            title="This book is not in your library"
            body="It may have been removed. Anything removed waits in Recently Deleted for 30 days."
            actionLabel="Back to the library"
            onAction={back}
          />
        ) : detail ? (
          <>
            <FlashList
              data={sessions}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.content}
              ListHeaderComponent={
                <View style={styles.header}>
                  <BookHero book={detail.book} read={detail.current} />
                  <ProgressCard book={detail.book} read={detail.current} />
                  {sessions.length > 0 ? (
                    <Text
                      accessibilityRole="header"
                      maxFontSizeMultiplier={rules.maxFontScale}
                      style={[typeStyle(font.heading), { color: c.text }]}
                    >
                      {detail.previous.length > 0
                        ? `Read ${detail.current.readNumber}`
                        : 'This read'}
                    </Text>
                  ) : null}
                </View>
              }
              ListFooterComponent={<PreviousReads reads={detail.previous} />}
            />
            <BookActionsSheet
              visible={sheetOpen}
              onClose={() => setSheetOpen(false)}
              book={detail.book}
              read={detail.current}
              onMove={onMove}
              onReread={onReread}
              onRemove={onRemove}
            />
          </>
        ) : null}
      </SkeletonGate>
    </Screen>
  )
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.screen },
  content: { paddingHorizontal: space.screen, paddingBottom: space.section },
  header: { gap: space.section, paddingBottom: space.row },
})
