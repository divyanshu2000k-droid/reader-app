/**
 * Add it yourself, and Edit details: one screen, from `ManualEntry.dc.html` (04-SCREENS,
 * Journey D). `book/new` adds; `book/edit?id=` edits. The rules are `bookForm.ts`, tested.
 *
 * - **A full-screen form, not a sheet**, so it measures the keyboard itself
 *   (ui/useKeyboardOverlap.ts), as the session logger does, and Add to library rides above it.
 * - **Only the title is required.** Save stays disabled until there is one.
 * - **The cover is a colour to recognise the book by**, or the colour derived from its title.
 *   A photographed cover is Plus's custom covers (08-MONETISATION).
 * - **Leaving with typed input asks first** (ui/useUnsavedGuard.ts).
 * - **Adding opens the new book's detail**; saving an edit goes back to it.
 */

import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import {
  EMPTY_FORM,
  LENGTH_MAX_DIGITS,
  TITLE_MAX,
  bookPatch,
  checkBookForm,
  formFromBook,
  isFormDirty,
  type AddStatus,
  type BookForm,
  type BookShape,
} from './bookForm'
import { addManually, getEditableBook, updateBookDetails, type EditableBook } from './queries'
import { DESCRIPTION_MAX_LENGTH } from '@/domain/bookDetails'
import { formatDuration, localYearOf, now } from '@/lib/dates'
import type { AppError } from '@/lib/result'
import { actions, confirm, status as statusCopy } from '@/lib/strings'
import { BookCover } from '@/ui/BookCover'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { ConfirmSheet } from '@/ui/ConfirmSheet'
import { EmptyState } from '@/ui/EmptyState'
import { Field } from '@/ui/Field'
import { Header, HeaderIconButton } from '@/ui/Header'
import { Icon } from '@/ui/Icon'
import { InlineError } from '@/ui/InlineError'
import { Screen } from '@/ui/Screen'
import { Segmented } from '@/ui/Segmented'
import { SkeletonGate } from '@/ui/Skeleton'
import {
  coverFallbacks,
  font,
  iconSize,
  radius,
  rules,
  size,
  space,
  typeStyle,
} from '@/ui/theme'
import { useKeyboardOverlap } from '@/ui/useKeyboardOverlap'
import { useUnsavedGuard } from '@/ui/useUnsavedGuard'
import { useColors } from '@/ui/useTheme'

const SHAPES = [
  { value: 'print', label: 'Print' },
  { value: 'audio', label: 'Audiobook' },
] as const satisfies readonly { value: BookShape; label: string }[]

const ADD_TO: readonly AddStatus[] = ['reading', 'want', 'finished']

export function BookFormScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id?: string; title?: string }>()
  const editId = typeof params.id === 'string' && params.id ? params.id : null
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))
  const [book, setBook] = useState<EditableBook | null | undefined>(editId ? undefined : null)
  const [error, setError] = useState<AppError | null>(null)

  useEffect(() => {
    if (!editId) return
    let cancelled = false
    void getEditableBook(editId)
      .then((b) => !cancelled && setBook(b))
      .catch(
        () =>
          !cancelled &&
          setError({
            tier: 'recoverable',
            message: 'Could not open this book',
            safe: 'Nothing was changed.',
          }),
      )
    return () => {
      cancelled = true
    }
  }, [editId])

  if (editId === null) {
    const title = typeof params.title === 'string' ? params.title : ''
    return (
      <Screen glow="upper">
        <FormView mode="add" initial={{ ...EMPTY_FORM, title }} book={null} />
      </Screen>
    )
  }

  return (
    <Screen glow="upper">
      {book ? (
        <FormView key={book.id} mode="edit" initial={formFromBook(book)} book={book} />
      ) : (
        <>
          <Header
            compact
            title="Edit details"
            left={<HeaderIconButton icon="back" accessibilityLabel="Back" onPress={back} />}
            right={<View style={styles.spacer} />}
          />
          {error ? <InlineError error={error} /> : null}
          <SkeletonGate loading={book === undefined && error === null} fallback={null}>
            {book === null ? (
              <EmptyState
                title="This book is not in your library"
                body="It may have been removed. Anything removed waits in Recently Deleted for 30 days."
                actionLabel="Go back"
                onAction={back}
              />
            ) : null}
          </SkeletonGate>
        </>
      )}
    </Screen>
  )
}

function FormView({
  mode,
  initial,
  book,
}: {
  mode: 'add' | 'edit'
  initial: BookForm
  book: EditableBook | null
}) {
  const c = useColors()
  const router = useRouter()
  // The baseline for "unsaved": an add that arrived with a searched title counts that as typed.
  const baseline = useMemo(() => (mode === 'add' ? EMPTY_FORM : initial), [mode, initial])
  const [form, setForm] = useState<BookForm>(initial)
  const [addTo, setAddTo] = useState<AddStatus>('reading')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<AppError | null>(null)
  const guard = useUnsavedGuard(isFormDirty(form, baseline))
  const { ref: formRef, onLayout: measureForm, overlap: keyboardCover } = useKeyboardOverlap()
  const check = checkBookForm(form, localYearOf(now()))
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))
  const set = (patch: Partial<BookForm>) => {
    setForm((f) => ({ ...f, ...patch }))
    setSaveError(null)
  }

  async function save() {
    if (!check.canSave || saving) return
    setSaving(true)
    setSaveError(null)
    if (mode === 'add') {
      const added = await addManually(form, addTo)
      setSaving(false)
      if (!added.ok) return setSaveError(added.error)
      guard.leave(() => {
        router.replace({ pathname: '/book/[id]', params: { id: added.value.bookId } })
        // Added to Finished: ask for the rating and date, over the new book's detail.
        if (addTo === 'finished') {
          router.push({ pathname: '/book/finish', params: { read: added.value.readId } })
        }
      })
      return
    }
    if (!book) return
    const patch = bookPatch(book, form)
    const saved =
      Object.keys(patch).length === 0 ? null : await updateBookDetails(book.id, patch)
    setSaving(false)
    if (saved && !saved.ok) return setSaveError(saved.error)
    guard.leave(back)
  }

  const lengthNumber = /^\d+$/.test(form.length.trim()) ? Number(form.length.trim()) : null
  const coverTitle = form.title.trim() || 'Untitled'

  return (
    <View ref={formRef} onLayout={measureForm} style={styles.fill}>
      <Header
        compact
        title={mode === 'add' ? 'Add it yourself' : 'Edit details'}
        left={<HeaderIconButton icon="back" accessibilityLabel="Back" onPress={back} />}
        right={<View style={styles.spacer} />}
      />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.coverCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <BookCover
            title={coverTitle}
            color={form.coverColor}
            localPath={book?.coverLocalPath ?? null}
            url={book?.coverUrl ?? null}
            size="header"
          />
          <View style={styles.fill}>
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.label), { color: c.textMuted }]}
            >
              {book?.coverUrl
                ? 'Cover colour, if the image cannot load'
                : 'Cover colour · optional'}
            </Text>
            <View style={styles.swatches} accessibilityRole="radiogroup">
              <Swatch
                label="From the title"
                selected={form.coverColor === null}
                onPress={() => set({ coverColor: null })}
              />
              {coverFallbacks.map((hex, i) => (
                <Swatch
                  key={hex}
                  label={`Colour ${i + 1}`}
                  color={hex}
                  selected={form.coverColor === hex}
                  onPress={() => set({ coverColor: hex })}
                />
              ))}
            </View>
          </View>
        </View>

        <Field
          label="Title"
          value={form.title}
          onChangeText={(title) => set({ title })}
          maxLength={TITLE_MAX}
          autoFocus={mode === 'add' && form.title === ''}
          error={check.errors.title}
        />
        <Field label="Author" value={form.author} onChangeText={(author) => set({ author })} />

        <Segmented
          accessibilityLabel="Print or audiobook"
          options={SHAPES}
          value={form.shape}
          onChange={(shape) => set({ shape })}
        />
        <Field
          label={form.shape === 'print' ? 'Length in pages' : 'Length in minutes'}
          value={form.length}
          onChangeText={(length) => set({ length })}
          keyboardType="number-pad"
          maxLength={LENGTH_MAX_DIGITS}
          error={check.errors.length}
        />
        {form.shape === 'audio' && lengthNumber !== null && lengthNumber > 0 ? (
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.label), { color: c.textMuted }]}
          >
            {`That is ${formatDuration(lengthNumber * 60)}.`}
          </Text>
        ) : null}

        {mode === 'add' ? (
          <View style={styles.group}>
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.label), { color: c.textMuted }]}
            >
              Add to
            </Text>
            <View style={styles.chips}>
              {ADD_TO.map((s) => (
                <Chip
                  key={s}
                  label={statusCopy[s]}
                  selected={addTo === s}
                  onPress={() => setAddTo(s)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <Field
          label="Publisher · optional"
          value={form.publisher}
          onChangeText={(publisher) => set({ publisher })}
        />
        <View style={styles.pair}>
          <Field
            style={styles.fill}
            label="Year · optional"
            value={form.year}
            onChangeText={(year) => set({ year })}
            keyboardType="number-pad"
            maxLength={4}
            error={check.errors.year}
          />
          <Field
            style={styles.fill}
            label="ISBN · optional"
            value={form.isbn}
            onChangeText={(isbn) => set({ isbn })}
            maxLength={17}
            error={check.errors.isbn}
          />
        </View>

        <Field
          label="About this book · optional"
          value={form.description}
          onChangeText={(description) => set({ description })}
          multiline
          maxLength={DESCRIPTION_MAX_LENGTH}
          error={check.errors.description}
        />

        <View style={styles.note}>
          <Icon name="check" size={iconSize.header} color={c.textFaint} />
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.secondary), styles.fill, { color: c.textMuted }]}
          >
            Books you add yourself work exactly like the rest: sessions, stats, streaks,
            everything.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: keyboardCover }]}>
        {saveError ? <InlineError error={saveError} /> : null}
        <Button
          label={mode === 'add' ? 'Add to library' : 'Save changes'}
          busyLabel="Saving"
          busy={saving}
          disabled={!check.canSave}
          onPress={() => void save()}
        />
      </View>

      <ConfirmSheet
        visible={guard.asking}
        title={confirm.discardChanges.title}
        body={confirm.discardChanges.body}
        confirmLabel={confirm.discardChanges.action}
        cancelLabel={actions.keepEditing}
        danger
        onConfirm={guard.discard}
        onCancel={guard.keep}
      />
    </View>
  )
}

function Swatch({
  label,
  color,
  selected,
  onPress,
}: {
  label: string
  color?: string
  selected: boolean
  onPress: () => void
}) {
  const c = useColors()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={size.hitSlopTight}
      onPress={onPress}
      style={[
        styles.swatch,
        {
          backgroundColor: color ?? c.surfaceRaised,
          borderColor: selected ? c.accentInk : c.border,
          borderWidth: selected ? 2 : 1,
        },
      ]}
    >
      {color === undefined ? (
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.caption), { color: c.textMuted }]}
        >
          A
        </Text>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  spacer: { width: size.iconButton },
  body: { gap: space.section, paddingBottom: space.section },
  coverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.rowWide,
    padding: space.cardTight,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.row,
    paddingTop: space.labelGap,
  },
  swatch: {
    width: size.iconButton,
    height: size.iconButton,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: { gap: space.labelGap },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.row },
  pair: { flexDirection: 'row', gap: space.stackTight, alignItems: 'flex-start' },
  note: { flexDirection: 'row', gap: space.stackTight, alignItems: 'flex-start' },
  footer: { gap: space.row, paddingTop: space.row },
})
