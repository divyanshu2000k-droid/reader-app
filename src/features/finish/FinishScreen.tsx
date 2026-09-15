/**
 * Finishing a book, from `FinishBook.dc.html` (04-SCREENS, Journey F).
 *
 * - **"Add to Finished" moves the book off Currently Reading**, with its rating, note and date,
 *   in one update of the read (queries.ts). Fable readers' named complaint is a finished book
 *   left on Currently Reading; here the move is not a separate step that can be forgotten.
 * - **Closing without saving changes nothing.** The book stays where it was. Leaving with a
 *   rating or a note typed asks first.
 * - **The line under the title follows the date**: move the date to last December and "your
 *   31st book this year" becomes "your 4th book of 2025" before anything is saved.
 * - **"Start the next one"** saves the same way, then opens the Library on Want to read.
 * - **A read that is already finished** opens here too, from the actions sheet, to change its
 *   rating, note or date. The same rules; the button says Save.
 *
 * Notes and quotes are Slice 5b: nothing here links to them.
 */

import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import {
  checkFinish,
  finishDateLabel,
  finishSummary,
  formFromRead,
  isFinishDirty,
  ratingFromTap,
  REVIEW_MAX_LENGTH,
  stepRating,
  withFinishDate,
  type FinishForm,
} from './finishForm'
import { getFinishContext, saveFinish, type FinishContext } from './queries'
import { now, takeLocalDate } from '@/lib/dates'
import type { AppError } from '@/lib/result'
import { actions, confirm } from '@/lib/strings'
import { BookCover } from '@/ui/BookCover'
import { Button } from '@/ui/Button'
import { ConfirmSheet } from '@/ui/ConfirmSheet'
import { openPicker } from '@/ui/datePicker'
import { EmptyState } from '@/ui/EmptyState'
import { Field } from '@/ui/Field'
import { Header, HeaderIconButton } from '@/ui/Header'
import { Icon } from '@/ui/Icon'
import { InlineError } from '@/ui/InlineError'
import { RatingInput } from '@/ui/RatingInput'
import { Screen } from '@/ui/Screen'
import { SkeletonGate } from '@/ui/Skeleton'
import { font, iconSize, motion, radius, rules, size, space, typeStyle } from '@/ui/theme'
import { useKeyboardOverlap } from '@/ui/useKeyboardOverlap'
import { usePressGuard } from '@/ui/usePressGuard'
import { useUnsavedGuard } from '@/ui/useUnsavedGuard'
import { useColors } from '@/ui/useTheme'

export function FinishScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ read?: string }>()
  const readId = typeof params.read === 'string' ? params.read : ''
  const [context, setContext] = useState<FinishContext | null | undefined>(undefined)
  const [error, setError] = useState<AppError | null>(null)
  const [nonce, setNonce] = useState(0)
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = readId ? await getFinishContext(readId) : null
        if (!cancelled) {
          setContext(next)
          setError(null)
        }
      } catch (cause) {
        if (!cancelled) {
          setError({
            tier: 'recoverable',
            message: 'Could not open this book',
            safe: 'Nothing was changed.',
            cause,
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [readId, nonce])

  return (
    <Screen glow="top">
      {context ? (
        <FinishView key={context.read.readId} context={context} />
      ) : (
        <>
          <Header
            right={<HeaderIconButton icon="close" accessibilityLabel="Close" onPress={close} />}
          />
          {error ? <InlineError error={error} onRetry={() => setNonce((n) => n + 1)} /> : null}
          <SkeletonGate loading={context === undefined && error === null} fallback={null}>
            {context === null ? (
              <EmptyState
                title="This book is not in your library"
                body="It may have been removed. Anything removed waits in Recently Deleted for 30 days."
                actionLabel="Go back"
                onAction={close}
              />
            ) : null}
          </SkeletonGate>
        </>
      )}
    </Screen>
  )
}

function FinishView({ context }: { context: FinishContext }) {
  const c = useColors()
  const router = useRouter()
  const { book, read, finished } = context
  const finishing = read.status !== 'finished'
  const baseline = useMemo(() => formFromRead(read, now()), [read])
  const [form, setForm] = useState<FinishForm>(baseline)
  const [busy, setBusy] = useState<'finish' | 'next' | null>(null)
  const [saveError, setSaveError] = useState<AppError | null>(null)
  // Finishing is itself the change: leaving a book-being-finished asks only once something was
  // typed or chosen, not merely because the screen opened.
  const guard = useUnsavedGuard(isFinishDirty(form, baseline))
  const { ref: formRef, onLayout: measureForm, overlap: keyboardCover } = useKeyboardOverlap()
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const at = now()
  const check = checkFinish(form, read, at)
  const summary = finishSummary({ read, form, finished, now: at })

  const update = (next: FinishForm) => {
    setForm(next)
    setSaveError(null)
  }

  const changeDate = usePressGuard(() => {
    const base = form.finishedAt ?? now()
    void openPicker('date', base, now()).then((picked) => {
      if (picked !== null) update(withFinishDate(form, takeLocalDate(base, picked)))
    })
  })

  async function save(then: 'finish' | 'next') {
    if (busy !== null || !check.canSave) return
    setBusy(then)
    setSaveError(null)
    const saved = await saveFinish(read, form)
    setBusy(null)
    if (!saved.ok) return setSaveError(saved.error)
    guard.leave(() => {
      if (then === 'next') {
        router.dismissTo({ pathname: '/', params: { tab: 'want', at: String(now()) } })
      } else close()
    })
  }

  return (
    <View ref={formRef} onLayout={measureForm} style={styles.fill}>
      <Header
        right={<HeaderIconButton icon="close" accessibilityLabel="Close" onPress={close} />}
      />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.cover}>
          <BookCover
            title={book.title}
            localPath={book.coverLocalPath}
            url={book.coverUrl}
            color={book.coverColor}
            size="hero"
          />
        </View>

        <View style={styles.headline} accessible accessibilityRole="header">
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.title), styles.center, { color: c.text }]}
          >
            {finishing ? `That's a wrap on ${book.title}.` : `You finished ${book.title}.`}
          </Text>
          {summary ? (
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.secondary), styles.center, { color: c.textMuted }]}
            >
              {summary}
            </Text>
          ) : null}
        </View>

        <View
          style={[styles.card, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}
        >
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.secondary), styles.center, { color: c.textMuted }]}
          >
            How was it?
          </Text>
          <RatingInput
            rating={form.rating}
            onTap={(index, leftHalf) =>
              update({ ...form, rating: ratingFromTap(index, leftHalf, form.rating) })
            }
            onStep={(direction) =>
              update({ ...form, rating: stepRating(form.rating, direction) })
            }
          />
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.label), styles.center, { color: c.textMuted }]}
          >
            {form.rating === null
              ? 'Tap the left or right half of a star for half ratings'
              : `${form.rating} out of 5 · tap it again to clear`}
          </Text>
        </View>

        <Field
          label="Anything you want to remember about it?"
          value={form.review}
          onChangeText={(review) => update({ ...form, review })}
          placeholder="Optional, and private"
          multiline
          maxLength={REVIEW_MAX_LENGTH}
          error={check.errors.review}
        />

        <View style={styles.dateWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${finishDateLabel(form.finishedAt, at)}. Change`}
            accessibilityHint="Opens a date picker"
            onPress={changeDate}
            style={({ pressed }) => [
              styles.dateRow,
              {
                backgroundColor: check.errors.date ? c.dangerSurface : c.surface,
                borderColor: check.errors.date ? c.dangerBorder : c.border,
              },
              pressed && styles.pressed,
            ]}
          >
            <Icon name="calendar" size={iconSize.header} color={c.textFaint} />
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.bodyStrong), styles.fill, { color: c.text }]}
            >
              {finishDateLabel(form.finishedAt, at)}
            </Text>
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.label), { color: c.accentInk }]}
            >
              {form.finishedAt === null ? 'Add date' : 'Change'}
            </Text>
          </Pressable>
          {check.errors.date ? (
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.label), { color: c.danger }]}
            >
              {check.errors.date}
            </Text>
          ) : form.finishedAt === null ? (
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.secondary), { color: c.textMuted }]}
            >
              Optional. Without a date it counts as finished, but in no year.
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: keyboardCover }]}>
        {saveError ? <InlineError error={saveError} /> : null}
        <Button
          label={finishing ? 'Add to Finished' : actions.save}
          busyLabel="Saving"
          busy={busy === 'finish'}
          disabled={!check.canSave || busy !== null}
          onPress={() => void save('finish')}
        />
        {finishing ? (
          <Button
            label="Start the next one"
            busyLabel="Saving"
            busy={busy === 'next'}
            disabled={!check.canSave || busy !== null}
            variant="secondary"
            onPress={() => void save('next')}
          />
        ) : null}
      </View>

      <ConfirmSheet
        visible={guard.asking}
        title={confirm.discardChanges.title}
        body={
          finishing
            ? 'The book stays where it was. The rating and note on this screen are dropped.'
            : 'Only the changes on this screen are dropped.'
        }
        confirmLabel={confirm.discardChanges.action}
        cancelLabel={actions.keepEditing}
        danger
        onConfirm={guard.discard}
        onCancel={guard.keep}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  body: { gap: space.section, paddingBottom: space.section },
  cover: { alignItems: 'center' },
  headline: { gap: space.labelGap },
  card: {
    gap: space.row,
    padding: space.card,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  dateWrap: { gap: space.labelGap },
  dateRow: {
    minHeight: size.field,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.row,
    paddingHorizontal: space.fieldPadX,
    borderWidth: 1,
    borderRadius: radius.field,
  },
  pressed: { transform: [{ scale: motion.press.scale }] },
  footer: { gap: space.row, paddingTop: space.row },
})
