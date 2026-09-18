/**
 * The note editor, from `NoteEditor.dc.html` (04-SCREENS, Journey G). The same screen writes
 * a new note and edits a saved one.
 *
 * - **A full screen, not a sheet.** A multiline editor is the worst case for the keyboard
 *   covering input, so the screen measures how much it covers (ui/keyboardOverlap.ts) and
 *   Save rides above it. Android does not resize an edge-to-edge Modal for the keyboard
 *   (09-ENVIRONMENT), which is why this is not one.
 * - **What is typed is kept as it is typed** (`noteDraft.ts`, `useDraftWriter.ts`). Backing
 *   out of a half-written note does not lose it, and the draft is local only: it never syncs,
 *   never appears in the list, and counts toward nothing.
 * - **No "Discard changes?" here, unlike the session logger.** That question exists where
 *   leaving loses what you typed, and here it does not. Asking it anyway would be a warning
 *   about something that is not going to happen, and the honest answer to it — "your draft is
 *   kept" — is an argument for not asking. See DECISIONS.md.
 * - **Delete asks once, leaves, then raises the undo toast**, so the toast is never drawn
 *   beneath the confirm sheet's Modal. Filed from Slice 3, and the reason the list has no
 *   delete of its own.
 *
 * All the rules — what saves, what is refused, what is written — are in `noteForm.ts`.
 */

import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { useDraftWriter } from './hooks/useDraftWriter'
import { useNoteTarget, type NoteTargetData } from './hooks/useNoteTarget'
import { DRAFT_SOURCE, openWith, type DraftTarget } from './noteDraft'
import {
  CONTENT_MAX,
  PAGE_MAX_DIGITS,
  checkForm,
  newNoteRow,
  notePatch,
  type NoteForm,
} from './noteForm'
import { clearDraft, createNote, deleteNote, restoreNote, updateNote } from './queries'
import type { NoteType } from '@/db/schema'
import { newId } from '@/lib/ids'
import type { AppError } from '@/lib/result'
import { actions, toasts } from '@/lib/strings'
import { Button } from '@/ui/Button'
import { ConfirmSheet } from '@/ui/ConfirmSheet'
import { EmptyState } from '@/ui/EmptyState'
import { Field } from '@/ui/Field'
import { Header, HeaderIconButton } from '@/ui/Header'
import { InlineError } from '@/ui/InlineError'
import { Screen } from '@/ui/Screen'
import { Segmented } from '@/ui/Segmented'
import { SkeletonGate } from '@/ui/Skeleton'
import { font, rules, size, space, typeStyle } from '@/ui/theme'
import { useToast } from '@/ui/Toast'
import { useKeyboardOverlap } from '@/ui/useKeyboardOverlap'
import { useColors } from '@/ui/useTheme'

const TYPES = [
  { value: 'note', label: 'My note' },
  { value: 'quote', label: 'Quote' },
] as const satisfies readonly { value: NoteType; label: string }[]

export function NoteEditorScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ book?: string; note?: string }>()
  const target: DraftTarget | null =
    typeof params.note === 'string' && params.note
      ? { kind: 'edit', noteId: params.note }
      : typeof params.book === 'string' && params.book
        ? { kind: 'new', bookId: params.book }
        : null
  const { loaded, error } = useNoteTarget(target)
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))
  const editing = target?.kind === 'edit'

  return (
    <Screen glow="upper">
      {loaded ? (
        // Keyed by what is being edited, so the form's state always starts from that note.
        <NoteFormView key={loaded.key} loaded={loaded} />
      ) : (
        <>
          <Header
            compact
            title={editing ? 'Edit note' : 'New note'}
            left={<HeaderIconButton icon="back" accessibilityLabel="Back" onPress={back} />}
            right={<View style={styles.spacer} />}
          />
          {error ? <InlineError error={error} /> : null}
          <SkeletonGate loading={loaded === undefined && error === null} fallback={null}>
            {loaded === null ? (
              <EmptyState
                title={
                  editing
                    ? 'This note is not here any more'
                    : 'This book is not in your library'
                }
                body="It may have been deleted. Anything deleted waits in Recently Deleted for 30 days."
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

function NoteFormView({ loaded }: { loaded: NoteTargetData }) {
  const c = useColors()
  const router = useRouter()
  const toast = useToast()
  const { book, context, baseline, stored } = loaded
  const editing = stored !== null

  // The draft wins over the saved note when it differs, and the screen says that it did: a
  // note that quietly comes back with different words than were last saved is worse than one
  // that explains itself.
  const [opened] = useState(() => openWith(baseline, loaded.draft))
  const [form, setForm] = useState<NoteForm>(opened.form)
  // One id per new note, kept across a failed save, so a retry upserts the same row.
  const [noteId] = useState(() => stored?.id ?? newId())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<AppError | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { ref: formRef, onLayout: measureForm, overlap: keyboardCover } = useKeyboardOverlap()
  const draft = useDraftWriter(loaded.key, form, baseline)

  const check = checkForm(form, { pageCount: book.pageCount })
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const update = (next: NoteForm) => {
    setForm(next)
    setSaveError(null)
  }

  /** Leaves having dealt with the draft. Nothing writes a draft after this (draftAction). */
  async function finishAndLeave() {
    draft.finish()
    await clearDraft(DRAFT_SOURCE, loaded.key)
    back()
  }

  async function save() {
    if (!check.canSave || saving) return
    setSaving(true)
    setSaveError(null)
    const result = editing
      ? await updateNote(noteId, notePatch(stored, form))
      : await createNote(newNoteRow(form, context, noteId))
    setSaving(false)
    if (!result.ok) return setSaveError(result.error)
    await finishAndLeave()
  }

  async function remove() {
    setDeleting(true)
    const result = await deleteNote(noteId)
    setDeleting(false)
    if (!result.ok) {
      setConfirmingDelete(false)
      return setSaveError(result.error)
    }
    setConfirmingDelete(false)
    await finishAndLeave()
    // After leaving: raised under a Modal it would be invisible (ui/ConfirmSheet.tsx).
    // `ok` is not "something happened" (write.ts): a note already gone gets no Undo.
    if (result.value.changed) {
      toast.showUndo(toasts.noteDeleted, () => restoreNote(noteId))
    }
  }

  return (
    <View ref={formRef} onLayout={measureForm} style={styles.fill}>
      <Header
        compact
        title={editing ? 'Edit note' : 'New note'}
        left={<HeaderIconButton icon="back" accessibilityLabel="Back" onPress={back} />}
        right={<View style={styles.spacer} />}
      />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.secondary), { color: c.textMuted }]}
          numberOfLines={1}
        >
          {book.title}
        </Text>

        <Segmented
          accessibilityLabel="A quote or your own note"
          options={TYPES}
          value={form.type}
          onChange={(type) => update({ ...form, type })}
        />

        <Field
          label={form.type === 'quote' ? 'The quote' : 'Your note'}
          placeholder={
            form.type === 'quote' ? 'Type or paste the words' : 'What do you want to remember?'
          }
          value={form.content}
          onChangeText={(content) => update({ ...form, content })}
          multiline
          autoFocus={!editing}
          maxLength={CONTENT_MAX}
          error={check.errors.content}
        />

        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[
            typeStyle(font.label),
            { color: opened.restored ? c.accentInk : c.textMuted },
          ]}
        >
          {opened.restored
            ? 'Picked up where you left off, from the draft saved while you typed.'
            : 'Saved as a draft while you type'}
        </Text>

        {/* `notes.page` means a page, so an audiobook is offered none (noteForm.ts). */}
        {context.hasPages ? (
          <Field
            label="Page"
            placeholder="Optional"
            value={form.page}
            onChangeText={(page) => update({ ...form, page })}
            keyboardType="number-pad"
            maxLength={PAGE_MAX_DIGITS}
            selectTextOnFocus
            error={check.errors.page}
          />
        ) : null}

        {check.hints.map((hint) => (
          <Text
            key={hint}
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.secondary), { color: c.textSecondary }]}
          >
            {hint}
          </Text>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: keyboardCover }]}>
        {saveError ? <InlineError error={saveError} /> : null}
        <Button
          label={editing ? 'Save changes' : 'Save note'}
          busyLabel="Saving"
          busy={saving}
          disabled={!check.canSave || deleting}
          onPress={() => void save()}
        />
        {editing ? (
          <Button
            label="Delete this note"
            variant="ghost"
            disabled={saving}
            onPress={() => setConfirmingDelete(true)}
          />
        ) : (
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.label), styles.centred, { color: c.textMuted }]}
          >
            Private to you. Nothing here is ever posted anywhere.
          </Text>
        )}
      </View>

      <ConfirmSheet
        visible={confirmingDelete}
        title="Delete this note?"
        body="You can undo this for a few seconds."
        confirmLabel={actions.delete}
        cancelLabel={actions.cancel}
        danger
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // As wide as the Back button, so the compact title sits in the true centre.
  spacer: { width: size.iconButton },
  body: { gap: space.section, paddingBottom: space.section },
  footer: { gap: space.row, paddingTop: space.row },
  centred: { textAlign: 'center' },
})
