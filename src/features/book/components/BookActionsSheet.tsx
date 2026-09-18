/**
 * The actions sheet, from `BookActions.dc.html`: the hub for managing a book (Journey H).
 *
 * Move to another status (including DNF), notes and quotes, start a re-read, edit details,
 * and remove. The artboard's "Share progress" opens a screen that belongs to Slice 11; a row
 * arrives with the screen it opens, not before it.
 *
 * **Finished is not a plain move.** Its chip opens the finish flow (Slice 5), which moves the
 * book with its rating and date, and a finished read gets a row to change those. A status-only
 * move to Finished could leave a book finished with no date the reader chose, which is what
 * `MoveStatus` makes impossible to write.
 *
 * Remove asks once, in place, using the confirm copy in strings.ts, then soft-deletes and
 * raises an undo toast. Deleting a book takes its sessions and notes with it (the cascade),
 * which is large enough to confirm even with an undo behind it.
 *
 * A failed action keeps the sheet open with the reason. It never closes on a failure and
 * leaves the reader wondering whether it worked.
 */

import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { BookSummary, ReadSummary } from '../queries'
import type { NoteCounts } from '@/db/noteCounts'
import type { ReadStatus } from '@/db/schema'
import { countsLine } from '@/domain/noteLine'
import type { MoveStatus } from '@/domain/reads'
import { canStartReread } from '@/domain/reads'
import type { AppError, Result } from '@/lib/result'
import { actions, confirm, status as statusCopy } from '@/lib/strings'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Icon, type IconName } from '@/ui/Icon'
import { InlineError } from '@/ui/InlineError'
import { Sheet } from '@/ui/Sheet'
import { font, motion, rules, size, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

const STATUSES: readonly ReadStatus[] = ['reading', 'want', 'finished', 'dnf']

interface Props {
  visible: boolean
  onClose: () => void
  book: BookSummary
  read: ReadSummary
  onMove: (status: MoveStatus) => Promise<Result<unknown>>
  /** Opens the finish flow for the current read. The sheet closes first. */
  onFinish: () => void
  onReread: () => Promise<Result<unknown>>
  /** Resolves ok once the book is removed; the screen then leaves and raises the toast. */
  onRemove: () => Promise<Result<unknown>>
  /** Opens Edit details. The sheet closes first. */
  onEdit: () => void
  /** Opens the book's notes and quotes. The sheet closes first. */
  onNotes: () => void
  /** Of the BOOK, across every read (db/noteCounts.ts). */
  notes: NoteCounts
}

type Busy = ReadStatus | 'reread' | 'remove' | null

export function BookActionsSheet({
  visible,
  onClose,
  book,
  read,
  onMove,
  onReread,
  onRemove,
  onEdit,
  onFinish,
  onNotes,
  notes,
}: Props) {
  const c = useColors()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<AppError | null>(null)
  // "Nothing saved yet" rather than "0 notes": a zero invites the reader to wonder what
  // happened to theirs, where an empty invitation reads as an empty book.
  const notesDetail = notes.total === 0 ? 'Nothing saved yet' : countsLine(notes)

  function close() {
    if (busy !== null) return
    setConfirming(false)
    setError(null)
    onClose()
  }

  async function run(which: Exclude<Busy, null>, action: () => Promise<Result<unknown>>) {
    if (busy !== null) return
    setBusy(which)
    setError(null)
    const result = await action()
    setBusy(null)
    if (result.ok) {
      setConfirming(false)
      onClose()
    } else {
      setError(result.error)
    }
  }

  return (
    <Sheet visible={visible} onClose={close} title={book.title}>
      {confirming ? (
        <View style={styles.block}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.heading), { color: c.text }]}
          >
            {confirm.deleteBook.title}
          </Text>
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.body), { color: c.textMuted }]}
          >
            {confirm.deleteBook.body}
          </Text>
          {error ? <InlineError error={error} /> : null}
          <Button
            label={confirm.deleteBook.action}
            busyLabel="Removing"
            busy={busy === 'remove'}
            variant="danger"
            onPress={() => void run('remove', onRemove)}
          />
          <Button
            label={actions.cancel}
            variant="ghost"
            disabled={busy !== null}
            onPress={() => {
              setConfirming(false)
              setError(null)
            }}
          />
        </View>
      ) : (
        <View style={styles.block}>
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.label), { color: c.textMuted }]}
          >
            MOVE TO
          </Text>
          <View style={styles.chips}>
            {STATUSES.map((s) => (
              <Chip
                key={s}
                label={statusCopy[s]}
                selected={s === read.status}
                accessibilityLabel={`Move to ${statusCopy[s]}`}
                onPress={() => {
                  if (s === read.status) return
                  if (s === 'finished') onFinish()
                  else void run(s, () => onMove(s))
                }}
              />
            ))}
          </View>
          {error ? <InlineError error={error} /> : null}
          {read.status === 'finished' ? (
            <ActionRow
              icon="star"
              title="Rating, note and finish date"
              detail={read.rating !== null ? `Rated ${read.rating} out of 5` : 'Not rated yet'}
              disabled={busy !== null}
              onPress={onFinish}
            />
          ) : null}
          <ActionRow
            icon="note"
            title="Notes and quotes"
            detail={notesDetail}
            disabled={busy !== null}
            onPress={onNotes}
          />
          {/* Only once the current read has ended (domain/reads.ts). */}
          {canStartReread(read.status) ? (
            <ActionRow
              icon="reread"
              title="Start a re-read"
              detail="Keeps this read and its rating untouched"
              disabled={busy !== null}
              onPress={() => void run('reread', onReread)}
            />
          ) : null}
          <ActionRow
            icon="pencil"
            title="Edit details"
            detail="Title, author, page count, cover colour"
            disabled={busy !== null}
            onPress={onEdit}
          />
          <ActionRow
            icon="trash"
            title={actions.remove}
            detail="Recoverable for 30 days"
            danger
            disabled={busy !== null}
            onPress={() => {
              setError(null)
              setConfirming(true)
            }}
          />
        </View>
      )}
    </Sheet>
  )
}

interface ActionRowProps {
  icon: IconName
  title: string
  detail: string
  danger?: boolean
  disabled: boolean
  onPress: () => void
}

function ActionRow({ icon, title, detail, danger = false, disabled, onPress }: ActionRowProps) {
  const c = useColors()
  const ink = danger ? c.danger : c.text
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { borderColor: c.border },
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Icon name={icon} color={danger ? c.danger : c.textSecondary} />
      <View style={styles.actionText}>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.bodyStrong), { color: ink }]}
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
    </Pressable>
  )
}

const styles = StyleSheet.create({
  block: { gap: space.row },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.row },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.rowWide,
    minHeight: size.minTouch,
    paddingVertical: space.cardTight,
    borderTopWidth: 1,
  },
  actionText: { flex: 1, gap: space.labelGap },
  pressed: { transform: [{ scale: motion.press.scale }] },
})
