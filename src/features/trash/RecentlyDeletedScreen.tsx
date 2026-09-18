/**
 * Recently Deleted, reachable from Settings (Journey K). Where a removed book, a deleted
 * session or a deleted note waits, and where it comes back from.
 *
 * Restoring brings back exactly what the removal took: the reads, sessions, notes and shelf
 * assignments deleted with it, and nothing deleted before it (write.ts, the cascade). A
 * restore that is refused says why, in place, rather than failing silently.
 */

import { FlashList } from '@shopify/flash-list'
import { useFocusEffect, useRouter } from 'expo-router'
import { memo, useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { deletedLine } from './deletedLine'
import { getDeletedItems, restoreDeleted, type DeletedItem } from './queries'
import { formatRelativeDay, formatWhen } from '@/lib/dates'
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

const RESTORED = {
  book: toasts.bookRestored,
  session: toasts.sessionRestored,
  note: toasts.noteRestored,
} as const

export function RecentlyDeletedScreen() {
  const router = useRouter()
  const toast = useToast()
  const [rows, setRows] = useState<DeletedItem[] | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await getDeletedItems())
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
    async (item: DeletedItem) => {
      if (restoring !== null) return
      setRestoring(item.id)
      const result = await restoreDeleted(item)
      setRestoring(null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      if (result.value.changed) {
        toast.show(RESTORED[item.kind])
      }
      await load()
    },
    [load, restoring, toast],
  )

  const renderItem = useCallback(
    ({ item }: { item: DeletedItem }) => (
      <DeletedRow
        item={item}
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
            keyExtractor={(item) => `${item.kind}:${item.id}`}
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
  item: DeletedItem
  busy: boolean
  disabled: boolean
  onRestore: (item: DeletedItem) => void
}

const DeletedRow = memo(function DeletedRow({ item, busy, disabled, onRestore }: RowProps) {
  const c = useColors()
  // What each kind of row says is in `deletedLine.ts`, tested.
  const { title, detail } = deletedLine(item, {
    removed: formatRelativeDay(item.deletedAt).toLowerCase(),
    when: item.kind === 'session' ? formatWhen(item.occurredAt) : '',
  })
  return (
    <View style={styles.row}>
      {item.kind === 'book' ? (
        <BookCover
          title={item.title}
          localPath={item.coverLocalPath}
          url={item.coverUrl}
          color={item.coverColor}
          size="dock"
        />
      ) : null}
      <View style={styles.text}>
        <Text
          // Three lines: at large text and a narrow screen, two cut the title to one word.
          numberOfLines={3}
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.bodyStrong), { color: c.text }]}
        >
          {title}
        </Text>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.secondary), { color: c.textMuted }]}
        >
          {detail}
        </Text>
      </View>
      <Button
        label={actions.restore}
        busyLabel="Restoring"
        busy={busy}
        disabled={disabled}
        variant="secondary"
        accessibilityLabel={`${actions.restore} ${title}, ${detail}`}
        onPress={() => onRestore(item)}
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
