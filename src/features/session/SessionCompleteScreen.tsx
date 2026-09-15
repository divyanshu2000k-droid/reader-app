/**
 * Session complete, from `SessionComplete.dc.html`: the session is already saved, and this
 * screen says so, then lets the reader fix the two things most often wrong in the moment,
 * the end page and the date (04-SCREENS, Journey E).
 *
 * - **Editable, and nothing is written until Done.** The stepper and Change edit the screen;
 *   Done saves what changed and nothing else. Leaving with changes asks first. The session
 *   itself stays saved either way.
 * - **Every number follows the edit** before Done: move the date to last Tuesday and the
 *   streak changes with it (sessionComplete.ts).
 * - **"I finished the book"** saves this screen's edits, then opens the finish flow (Slice 5),
 *   which moves the book to Finished with its rating and date. It replaces this screen, so
 *   closing the finish flow returns to where the session was started (book detail, or the
 *   Library's Continue pill), not back on a session already saved.
 */

import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { WhenField } from './components/WhenField'
import { useSessionTarget } from './hooks/useSessionTarget'
import { getReadingDays, saveSessionNote, updateSession, type EditContext } from './queries'
import { completeSummary, stepEnd } from './sessionComplete'
import {
  checkForm,
  formFromSession,
  isDirty,
  sessionPatch,
  type SessionForm,
} from './sessionForm'
import { formatDuration, now, todayLocalDay, type LocalDay } from '@/lib/dates'
import type { AppError } from '@/lib/result'
import { actions, confirm } from '@/lib/strings'
import { Button } from '@/ui/Button'
import { ConfirmSheet } from '@/ui/ConfirmSheet'
import { EmptyState } from '@/ui/EmptyState'
import { Field } from '@/ui/Field'
import { Header, HeaderIconButton } from '@/ui/Header'
import { Icon } from '@/ui/Icon'
import { InlineError } from '@/ui/InlineError'
import { Screen } from '@/ui/Screen'
import { SkeletonGate } from '@/ui/Skeleton'
import {
  font,
  iconSize,
  iconStroke,
  motion,
  radius,
  rules,
  size,
  space,
  typeStyle,
} from '@/ui/theme'
import { useKeyboardOverlap } from '@/ui/useKeyboardOverlap'
import { useUnsavedGuard } from '@/ui/useUnsavedGuard'
import { useColors } from '@/ui/useTheme'

export function SessionCompleteScreen() {
  const router = useRouter()
  const { session } = useLocalSearchParams<{ session?: string }>()
  const sessionId = typeof session === 'string' ? session : ''
  const { loaded, error, reload } = useSessionTarget(
    sessionId ? { kind: 'edit', sessionId } : null,
  )
  const [otherDays, setOtherDays] = useState<readonly LocalDay[] | null>(null)
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    // The streak is a nicety on this screen: if it cannot be read, the tile is left out
    // rather than the screen failing.
    void getReadingDays(sessionId)
      .then((days) => !cancelled && setOtherDays(days))
      .catch(() => !cancelled && setOtherDays([]))
    return () => {
      cancelled = true
    }
  }, [sessionId])

  return (
    <Screen glow="top">
      {loaded && loaded.kind === 'edit' && otherDays !== null ? (
        <CompleteView
          key={loaded.context.session.id}
          context={loaded.context}
          otherDays={otherDays}
        />
      ) : (
        <>
          <Header
            right={<HeaderIconButton icon="close" accessibilityLabel="Close" onPress={close} />}
          />
          {error ? <InlineError error={error} onRetry={reload} /> : null}
          <SkeletonGate loading={loaded === undefined && error === null} fallback={null}>
            {loaded === null ? (
              <EmptyState
                title="This session is not here any more"
                body="It may have been deleted. Anything deleted waits in Recently Deleted for 30 days."
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

function CompleteView({
  context,
  otherDays,
}: {
  context: EditContext
  otherDays: readonly LocalDay[]
}) {
  const c = useColors()
  const router = useRouter()
  const stored = context.session
  const baseline = useMemo(() => formFromSession(stored), [stored])
  const [form, setForm] = useState<SessionForm>(baseline)
  const [note, setNote] = useState(stored.note ?? '')
  const [busy, setBusy] = useState<'done' | 'finish' | null>(null)
  const [saveError, setSaveError] = useState<AppError | null>(null)

  const noteChanged = note.trim() !== (stored.note ?? '')
  const guard = useUnsavedGuard(isDirty(form, baseline) || noteChanged)
  const { ref: formRef, onLayout: measureForm, overlap: keyboardCover } = useKeyboardOverlap()
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const check = checkForm(form, {
    now: now(),
    book: context.book,
    others: context.sessions,
    editingId: stored.id,
    allowNoPositions: stored.durationSeconds !== null,
  })
  const summary = completeSummary({
    form,
    session: stored,
    readSessions: context.sessions,
    book: context.book,
    otherDays,
    today: todayLocalDay(),
  })
  const unit = form.format === 'pages' ? 'page' : 'minute'
  const hasEnd = form.to.trim() !== ''

  const update = (next: SessionForm) => {
    setForm(next)
    setSaveError(null)
  }

  async function finish(markFinished: boolean) {
    if (busy !== null || !check.canSave) return
    setBusy(markFinished ? 'finish' : 'done')
    setSaveError(null)
    const patch = sessionPatch(stored, form)
    if (Object.keys(patch).length > 0) {
      const saved = await updateSession(stored.id, patch)
      if (!saved.ok) {
        setBusy(null)
        return setSaveError(saved.error)
      }
    }
    if (noteChanged) {
      const saved = await saveSessionNote(stored.id, note)
      if (!saved.ok) {
        setBusy(null)
        return setSaveError(saved.error)
      }
    }
    setBusy(null)
    guard.leave(() =>
      markFinished
        ? router.replace({ pathname: '/book/finish', params: { read: context.read.readId } })
        : close(),
    )
  }

  const leftText =
    summary.left === null
      ? null
      : summary.left.kind === 'time'
        ? { value: `~${formatDuration(summary.left.seconds)}`, label: 'left to go' }
        : { value: String(summary.left.count), label: 'pages left' }

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
        <View style={styles.headline} accessible accessibilityRole="header">
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.label), { color: c.textMuted }]}
          >
            SESSION SAVED
          </Text>
          <Text
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.displayLg), { color: c.accentInk }]}
          >
            {summary.headline}
          </Text>
          {summary.headlineUnit ? (
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.body), { color: c.textMuted }]}
            >
              {summary.headlineUnit}
            </Text>
          ) : null}
          {summary.detail ? (
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.body), { color: c.textMuted }]}
            >
              {summary.detail}
            </Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {hasEnd ? (
            <View style={[styles.endRow, { borderColor: c.border }]}>
              <View style={styles.fill}>
                <Text
                  maxFontSizeMultiplier={rules.maxFontScale}
                  style={[typeStyle(font.label), { color: c.textMuted }]}
                >
                  {`Finished on ${unit}`}
                </Text>
                <Text
                  maxFontSizeMultiplier={rules.maxFontScale}
                  style={[typeStyle(font.heading), { color: c.text }]}
                >
                  {form.to}
                </Text>
              </View>
              <StepButton
                icon="minus"
                label={`One ${unit} fewer`}
                onPress={() => update(stepEnd(form, -1))}
              />
              <StepButton
                icon="plus"
                label={`One ${unit} more`}
                accent
                onPress={() => update(stepEnd(form, 1))}
              />
            </View>
          ) : null}
          {check.errors.to ? (
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.label), { color: c.danger }]}
            >
              {check.errors.to}
            </Text>
          ) : null}
          <WhenField
            value={form.occurredAt}
            onChange={(occurredAt) => update({ ...form, occurredAt })}
            error={check.errors.when}
            showHelp={false}
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

        <View style={styles.tiles}>
          <Tile value={String(summary.streak)} label="day streak" accent />
          {summary.fraction !== null ? (
            <Tile value={`${Math.round(summary.fraction * 100)}%`} label="through the book" />
          ) : null}
          {leftText ? <Tile value={leftText.value} label={leftText.label} /> : null}
        </View>

        <Field
          label="A thought while it is fresh"
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Optional"
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: keyboardCover }]}>
        {saveError ? <InlineError error={saveError} /> : null}
        <Button
          label={actions.done}
          busyLabel="Saving"
          busy={busy === 'done'}
          disabled={!check.canSave || busy !== null}
          onPress={() => void finish(false)}
        />
        {context.read.status !== 'finished' ? (
          <Button
            label={actions.finishBook}
            busyLabel="Saving"
            busy={busy === 'finish'}
            disabled={!check.canSave || busy !== null}
            variant="secondary"
            onPress={() => void finish(true)}
          />
        ) : null}
      </View>

      <ConfirmSheet
        visible={guard.asking}
        title={confirm.discardChanges.title}
        body="The session stays saved. Only the changes on this screen are dropped."
        confirmLabel={confirm.discardChanges.action}
        cancelLabel={actions.keepEditing}
        danger
        onConfirm={guard.discard}
        onCancel={guard.keep}
      />
    </View>
  )
}

function StepButton({
  icon,
  label,
  accent = false,
  onPress,
}: {
  icon: 'minus' | 'plus'
  label: string
  accent?: boolean
  onPress: () => void
}) {
  const c = useColors()
  // Deliberately NOT press-guarded: tapping + five times quickly means five pages. Each tap
  // only edits the screen, and nothing is written until Done.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={size.iconButtonHitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        {
          backgroundColor: accent ? c.accentSurface : c.surfaceRaised,
          borderColor: accent ? c.accentBorder : c.borderStrong,
          borderRadius: radius.buttonSmall,
        },
        pressed && styles.pressed,
      ]}
    >
      <Icon
        name={icon}
        size={iconSize.header}
        color={accent ? c.accentInk : c.textSecondary}
        strokeWidth={iconStroke.raised}
      />
    </Pressable>
  )
}

function Tile({
  value,
  label,
  accent = false,
}: {
  value: string
  label: string
  accent?: boolean
}) {
  const c = useColors()
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}
    >
      <Text
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.heading), { color: accent ? c.accentInk : c.text }]}
      >
        {value}
      </Text>
      <Text
        maxFontSizeMultiplier={rules.maxFontScale}
        style={[typeStyle(font.caption), { color: c.textMuted }]}
      >
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { gap: space.section, paddingBottom: space.section },
  headline: { alignItems: 'center', gap: space.labelGap },
  card: {
    gap: space.cardTight,
    padding: space.card,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  endRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.row,
    paddingBottom: space.cardTight,
    borderBottomWidth: 1,
  },
  step: {
    width: size.minTouch,
    height: size.minTouch,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: motion.press.scale }] },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.row },
  tile: {
    flexGrow: 1,
    gap: space.labelGap,
    padding: space.cardTight,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  footer: { gap: space.row, paddingTop: space.row },
})
