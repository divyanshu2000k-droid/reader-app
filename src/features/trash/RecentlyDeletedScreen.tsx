/**
 * Recently Deleted, reachable from Settings (Journey K). Where a removed book waits, and
 * where it comes back from.
 *
 * Restoring brings back exactly what the removal took: the reads, sessions, notes and shelf
 * assignments deleted with it, and nothing deleted before it (write.ts, the cascade). A
 * restore that is refused says why, in place, rather than failing silently.
 */

import { FlashList } from '@shopify/flash-list'
import { useFocusEffect, useRouter } from 'expo-router'
import { memo, useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { getDeletedBooks, restoreDeletedBook, type DeletedBook } from './queries'
import { formatRelativeDay } from '@/lib/dates'
import { appError, type AppError } from '@/lib/result'
import { actions, empty, toasts } from '@/lib/strings'
import { BookCover } from '@/ui/BookCover'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/EmptyState'
import { Header, HeaderIconButton } from '@/ui/Header'
import { InlineError } from '@/ui/InlineError'
import { Screen } from '@/ui/Screen'
import { SkeletonGate } from '@/ui/Skeleton'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useToast } from '@/ui/Toast'
import { useColors } from '@/ui/useTheme'

export function RecentlyDeletedScreen() {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState<DeletedBook[] | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await getDeletedBooks())
      setError(null)
    } catch (cause) {
      setError(
        appError('recoverable', 'Could not open Recently Deleted', {
          safe: 'Nothing was changed.',
          cause,
        }),
      )
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const restore = useCallback(
    async (book: DeletedBook) => {
      if (restoring !== null) return
      setRestoring(book.id)
      const result = await restoreDeletedBook(book.id)
      setRestoring(null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      if (result.value.changed) toast.show(toasts.bookRestored)
      await load()
    },
    [load, restoring, toast],
  )

  const renderItem = useCallback(
    ({ item }: { item: DeletedBook }) => (
      <DeletedRow
        book={item}
        busy={restoring === item.id}
        disabled={restoring !== null}
        onRestore={restore}
      />
    ),
    [restore, restoring],
  )

  return (
    <Screen padded={false}>
      <View style={styles.head}>
        <Header
          title="Recently deleted"
          left={
            <HeaderIconButton
              icon="back"
              accessibilityLabel="Back"
              onPress={() => router.back()}
            />
          }
        />
        {error ? <InlineError error={error} onRetry={() => void load()} /> : null}
      </View>
      <SkeletonGate loading={rows === null && error === null} fallback={null}>
        {rows && rows.length === 0 ? (
          <EmptyState title={empty.trash.title} body={empty.trash.body} />
        ) : (
          <FlashList
            data={rows ?? []}
            renderItem={renderItem}
            keyExtractor={(b) => b.id}
            extraData={restoring}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={RowGap}
          />
        )}
      </SkeletonGate>
    </Screen>
  )
}

interface RowProps {
  book: DeletedBook
  busy: boolean
  disabled: boolean
  onRestore: (book: DeletedBook) => void
}

const DeletedRow = memo(function DeletedRow({ book, busy, disabled, onRestore }: RowProps) {
  const c = useColors()
  return (
    <View style={styles.row}>
      <BookCover
        title={book.title}
        localPath={book.coverLocalPath}
        url={book.coverUrl}
        color={book.coverColor}
        size="dock"
      />
      <View style={styles.text}>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.bodyStrong), { color: c.text }]}
        >
          {book.title}
        </Text>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.secondary), { color: c.textMuted }]}
        >
          {`Removed ${formatRelativeDay(book.deletedAt).toLowerCase()}`}
        </Text>
      </View>
      <Button
        label={actions.restore}
        busyLabel="Restoring"
        busy={busy}
        disabled={disabled}
        variant="secondary"
        accessibilityLabel={`${actions.restore} ${book.title}`}
        onPress={() => onRestore(book)}
      />
    </View>
  )
})

function RowGap() {
  return <View style={styles.gap} />
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.screen },
  list: { paddingHorizontal: space.screen, paddingTop: space.row },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.rowWide },
  text: { flex: 1, gap: space.labelGap },
  gap: { height: space.cardTight },
})
