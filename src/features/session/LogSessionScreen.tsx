/**
 * Log a session, from `Session.dc.html`: the most important screen in the app (04-SCREENS,
 * Journey E). The same screen edits a saved session, reached from book detail.
 *
 * - **A full screen, not a sheet**, as designed. The keyboard is handled by measuring how much
 *   of the screen it covers (ui/keyboardOverlap.ts), so Save rides above it.
 * - **A new session opens with "Now on page" focused**: Continue, type, Save. That is the
 *   two-tap budget in `rules.maxTapsToLog`.
 * - **Save writes and leaves.** No spinner over the reader's data: the write is local and
 *   returns at once. A new session goes on to Session complete; an edit goes back.
 * - **Leaving with unsaved input asks first**, by any route (ui/useUnsavedGuard.ts).
 * - **Delete asks once, leaves, then raises the undo toast**, so the toast is never drawn
 *   beneath the confirm sheet's Modal.
 *
 * All the rules (what saves, what is refused, what is only pointed out, what is written) are
 * in `sessionForm.ts`, tested.
 */

import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

import { BookLine } from './components/BookLine'
import { QuickAddRow } from './components/QuickAddRow'
import { WhenField } from './components/WhenField'
import {
  useSessionTarget,
  type LoadedContext,
  type SessionTarget,
} from './hooks/useSessionTarget'
import { createSession, deleteSession, restoreSession, updateSession } from './queries'
import {
  POSITION_MAX_DIGITS,
  bookEnd,
  checkForm,
  defaultFormat,
  formFromSession,
  isDirty,
  newForm,
  newSessionRow,
  quickAdd,
  sessionPatch,
  sessionSpan,
  switchFormat,
  type SessionForm,
} from './sessionForm'
import type { SessionFormat } from '@/db/schema'
import { isAudiobook } from '@/domain/progressDisplay'
import { now } from '@/lib/dates'
import { newId } from '@/lib/ids'
import type { AppError } from '@/lib/result'
import { actions, confirm, session as labels, toasts } from '@/lib/strings'
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
import { useUnsavedGuard } from '@/ui/useUnsavedGuard'
import { useColors } from '@/ui/useTheme'

const FORMATS = [
  { value: 'pages', label: 'Pages' },
  { value: 'minutes', label: 'Minutes' },
] as const satisfies readonly { value: SessionFormat; label: string }[]

export function LogSessionScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ book?: string; session?: string }>()
  const target: SessionTarget | null =
    typeof params.session === 'string' && params.session
      ? { kind: 'edit', sessionId: params.session }
      : typeof params.book === 'string' && params.book
        ? { kind: 'new', bookId: params.book }
        : null
  const { loaded, error, reload } = useSessionTarget(target)
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))
  const editing = target?.kind === 'edit'

  return (
    <Screen glow="upper">
      {loaded ? (
        // Keyed by what is being logged, so the form's state always starts from that context.
        <SessionFormView
          key={loaded.kind === 'edit' ? loaded.context.session.id : loaded.context.read.readId}
          loaded={loaded}
        />
      ) : (
        <>
          <Header
            compact
            title={editing ? 'Edit session' : actions.logSession}
            left={<HeaderIconButton icon="back" accessibilityLabel="Back" onPress={back} />}
            right={<View style={styles.spacer} />}
          />
          {error ? <InlineError error={error} onRetry={reload} /> : null}
          <SkeletonGate loading={loaded === undefined && error === null} fallback={null}>
            {loaded === null ? (
              <EmptyState
                title={
                  editing
                    ? 'This session is not here any more'
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

function SessionFormView({ loaded }: { loaded: LoadedContext }) {
  const c = useColors()
  const router = useRouter()
  const toast = useToast()
  const { context } = loaded
  const editing = loaded.kind === 'edit'
  const stored = loaded.kind === 'edit' ? loaded.context.session : null

  const baseline = useMemo<SessionForm>(() => {
    if (loaded.kind === 'edit') return formFromSession(loaded.context.session)
    const audio = isAudiobook({
      totalMinutes: context.book.totalMinutes,
      page: context.positions.pages,
      minute: context.positions.minutes,
    })
    return newForm(defaultFormat(context.latestFormat, audio), context.positions, now())
  }, [loaded, context])

  const [form, setForm] = useState(baseline)
  // One id per new session, kept across a failed save, so a retry upserts the same row.
  const [sessionId] = useState(() => stored?.id ?? newId())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<AppError | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const dirty = isDirty(form, baseline)
  const guard = useUnsavedGuard(dirty)
  const { ref: formRef, onLayout: measureForm, overlap: keyboardCover } = useKeyboardOverlap()

  const check = checkForm(form, {
    now: now(),
    book: context.book,
    others: context.sessions,
    editingId: stored?.id ?? null,
    allowNoPositions: stored !== null && stored.durationSeconds !== null,
  })
  const span = sessionSpan(form)
  const unit = form.format === 'pages' ? 'page' : 'minute'
  const end = bookEnd(form.format, context.book)
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const update = (next: SessionForm) => {
    setForm(next)
    setSaveError(null)
  }

  async function save() {
    if (!check.canSave || saving) return
    setSaving(true)
    setSaveError(null)
    if (loaded.kind === 'new') {
      const row = newSessionRow(form, { id: sessionId, readId: context.read.readId })
      const result = await createSession(row, context.read.status)
      setSaving(false)
      if (!result.ok) return setSaveError(result.error)
      guard.leave(() =>
        router.replace({ pathname: '/session/complete', params: { session: sessionId } }),
      )
      return
    }
    const patch = sessionPatch(loaded.context.session, form)
    const result =
      Object.keys(patch).length === 0 ? null : await updateSession(sessionId, patch)
    setSaving(false)
    if (result && !result.ok) return setSaveError(result.error)
    guard.leave(back)
  }

  async function remove() {
    setDeleting(true)
    const result = await deleteSession(sessionId)
    setDeleting(false)
    if (!result.ok) {
      setConfirmingDelete(false)
      return setSaveError(result.error)
    }
    setConfirmingDelete(false)
    guard.leave(back)
    // After leaving: raised under a Modal it would be invisible (ui/ConfirmSheet.tsx).
    if (result.value.changed)
      toast.showUndo(toasts.sessionDeleted, () => restoreSession(sessionId))
  }

  return (
    <View ref={formRef} onLayout={measureForm} style={styles.fill}>
      <Header
        compact
        title={editing ? 'Edit session' : actions.logSession}
        left={<HeaderIconButton icon="back" accessibilityLabel="Back" onPress={back} />}
        right={<View style={styles.spacer} />}
      />
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <BookLine book={context.book} />

        <View
          style={styles.hero}
          accessible
          accessibilityLabel={`${span ?? 0} ${unit}s this session`}
        >
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.hero), { color: c.accentInk }]}
          >
            {span ?? 0}
          </Text>
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.secondary), { color: c.textMuted }]}
          >
            {`${unit}s this session`}
          </Text>
        </View>

        <QuickAddRow
          unit={unit}
          end={end}
          onAdd={(n) => update(quickAdd(form, n))}
          onFinish={() => end !== null && update({ ...form, to: String(end) })}
        />

        <View style={styles.positions}>
          <Field
            style={styles.fill}
            label={form.format === 'pages' ? labels.fromPages : labels.fromMinutes}
            value={form.from}
            onChangeText={(from) => update({ ...form, from })}
            keyboardType="number-pad"
            maxLength={POSITION_MAX_DIGITS}
            selectTextOnFocus
            error={check.errors.from}
          />
          <Field
            style={styles.fill}
            label={form.format === 'pages' ? labels.toPages : labels.toMinutes}
            value={form.to}
            onChangeText={(to) => update({ ...form, to })}
            keyboardType="number-pad"
            maxLength={POSITION_MAX_DIGITS}
            selectTextOnFocus
            autoFocus={!editing}
            error={check.errors.to}
          />
        </View>

        {check.hints.map((hint) => (
          <Text
            key={hint}
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.secondary), { color: c.textSecondary }]}
          >
            {hint}
          </Text>
        ))}

        <WhenField
          value={form.occurredAt}
          onChange={(occurredAt) => update({ ...form, occurredAt })}
          error={check.errors.when}
        />

        <Segmented
          accessibilityLabel="Pages or minutes"
          options={FORMATS}
          value={form.format}
          onChange={(format) =>
            update(switchFormat(form, format, editing ? null : context.positions))
          }
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: keyboardCover }]}>
        {saveError ? <InlineError error={saveError} /> : null}
        <Button
          label={editing ? 'Save changes' : 'Save session'}
          busyLabel="Saving"
          busy={saving}
          disabled={!check.canSave || deleting}
          onPress={() => void save()}
        />
        {editing ? (
          <Button
            label="Delete this session"
            variant="ghost"
            disabled={saving}
            onPress={() => setConfirmingDelete(true)}
          />
        ) : (
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.label), styles.note, { color: c.textMuted }]}
          >
            Editable anytime
          </Text>
        )}
      </View>

      <ConfirmSheet
        visible={confirmingDelete}
        title={confirm.deleteSession.title}
        body={confirm.deleteSession.body}
        confirmLabel={confirm.deleteSession.action}
        cancelLabel={actions.cancel}
        danger
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmingDelete(false)}
      />
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // As wide as the Back button, so the compact title sits in the true centre.
  spacer: { width: size.iconButton },
  body: { gap: space.section, paddingBottom: space.section },
  hero: { alignItems: 'center', gap: space.stackTight },
  positions: { flexDirection: 'row', gap: space.stackTight, alignItems: 'flex-start' },
  footer: { gap: space.row, paddingTop: space.row },
  note: { textAlign: 'center' },
})
