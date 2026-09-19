/**
 * The reading timer, from `Reading.dc.html` (04-SCREENS, Journey E).
 *
 * - **This screen owns nothing.** The run, the heartbeat and the notification live in
 *   `timerService.ts`, a module that outlives it. Leaving the screen genuinely leaves the
 *   timer running — which it did not until 2026-09-18 (`docs/10-AUDIT-2026-09-18.md`).
 * - **Start writes the session row before the ring draws** (`queries.startTimer`), so a crash
 *   one second in still records that reading happened.
 * - **The clock is derived from timestamps, never counted** (`domain/timerState.ts`). The
 *   once-a-second re-render is a redraw, not an accumulation.
 * - **Finish routes to Session complete**, which already owns the end page, the streak and the
 *   date. The timer knows the duration; it does not know the page.
 * - **Discard asks first**, and is the only way to throw a session away.
 *
 * The artboard also shows Highlight beside Pause: that is the camera, deferred to the last
 * slice with the rest of it, so it is not drawn.
 */

import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { TimerRing } from './components/TimerRing'
import { useTimer } from './hooks/useTimer'
import { discardTimer as deleteTimedSession } from './queries'
import { getVanishedTimer } from './timerService'
import { isAudiobook } from '@/domain/progressDisplay'
import { formatClock, ringFraction } from '@/domain/timerState'
import type { AppError } from '@/lib/result'
import { actions } from '@/lib/strings'
import { BookCover } from '@/ui/BookCover'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/EmptyState'
import { ConfirmSheet } from '@/ui/ConfirmSheet'
import { Header, HeaderIconButton } from '@/ui/Header'
import { InlineError } from '@/ui/InlineError'
import { Screen } from '@/ui/Screen'
import { font, rules, size, space, typeStyle } from '@/ui/theme'
import { usePressGuard } from '@/ui/usePressGuard'
import { useColors } from '@/ui/useTheme'

export function TimerScreen() {
  const c = useColors()
  const router = useRouter()
  const timer = useTimer()
  const [error, setError] = useState<AppError | null>(null)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [busy, setBusy] = useState(false)

  const snapshot = timer.snapshot
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))

  const finish = usePressGuard(async () => {
    if (busy || snapshot === null) return
    setBusy(true)
    setError(null)
    const sessionId = snapshot.run.sessionId
    const result = await timer.finish(null)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    router.replace({ pathname: '/session/complete', params: { session: sessionId } })
  })

  async function discard() {
    setBusy(true)
    const sessionId = await timer.discard()
    if (sessionId !== null) {
      const result = await deleteTimedSession(sessionId)
      if (!result.ok) {
        setBusy(false)
        setConfirmingDiscard(false)
        return setError(result.error)
      }
    }
    setBusy(false)
    setConfirmingDiscard(false)
    back()
  }

  // The service releases the timer on finish and discard, so a null snapshot usually means
  // the session is over and this screen is on its way out.
  if (snapshot === null) {
    const gone = getVanishedTimer()
    // Unless the book was REMOVED underneath the timer, in which case say so. The cascade
    // took the session with the book, and restoring the book brings both back — the reader
    // has lost nothing, but they must not be left looking at a ring that stopped for no
    // visible reason. Owner's decision, 2026-09-19.
    return (
      <Screen glow="upper">
        {gone ? (
          <EmptyState
            title="That book was removed"
            body={`Your session went to Recently Deleted with ${gone.bookTitle}. Restore the book and the session comes back with it.`}
            actionLabel="Back to the library"
            onAction={back}
          />
        ) : (
          <View />
        )}
      </Screen>
    )
  }

  const { book, fromPosition } = snapshot
  const audio = isAudiobook({
    totalMinutes: book.totalMinutes,
    page: fromPosition,
    minute: fromPosition,
  })
  const unit = audio ? 'minute' : 'page'
  const running = timer.running

  return (
    <Screen glow="upper">
      <Header
        compact
        left={<HeaderIconButton icon="back" accessibilityLabel="Back" onPress={back} />}
        right={
          <Button
            label="Finish"
            variant="ghost"
            disabled={busy}
            onPress={() => void finish()}
          />
        }
      />

      <View style={styles.body}>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.label), { color: c.textMuted }]}
        >
          {running ? 'READING NOW' : 'PAUSED'}
        </Text>
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.heading), styles.centred, { color: c.text }]}
        >
          {book.title}
        </Text>

        <View
          style={styles.ring}
          accessible
          accessibilityLabel={`${formatClock(timer.seconds)} of reading, ${running ? 'running' : 'paused'}`}
          accessibilityLiveRegion="polite"
        >
          <TimerRing fraction={ringFraction(timer.seconds)} paused={!running} />
          <View style={styles.ringInner} pointerEvents="none">
            <Text
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.displayLg), { color: c.text }]}
            >
              {formatClock(timer.seconds)}
            </Text>
            {fromPosition !== null ? (
              <Text
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.secondary), { color: c.textMuted }]}
              >
                {`from ${unit} ${fromPosition}`}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.bookLine}>
          <BookCover
            title={book.title}
            localPath={book.coverLocalPath}
            url={book.coverUrl}
            color={book.coverColor}
            size="dock"
          />
          {book.author ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.secondary), { color: c.textSecondary }]}
            >
              {book.author}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        {error ? <InlineError error={error} /> : null}
        <Button
          label={running ? 'Pause' : 'Resume'}
          disabled={busy}
          onPress={() => (running ? timer.pause() : timer.resume())}
        />
        <Button
          label="Notes"
          variant="secondary"
          disabled={busy}
          onPress={() => router.push({ pathname: '/book/notes', params: { id: book.id } })}
        />
        <Button
          label="Discard this session"
          variant="ghost"
          disabled={busy}
          onPress={() => setConfirmingDiscard(true)}
        />
      </View>

      <ConfirmSheet
        visible={confirmingDiscard}
        title="Throw this session away?"
        body="The time you have read will not be saved. It waits in Recently Deleted for 30 days."
        confirmLabel="Discard"
        cancelLabel={actions.cancel}
        danger
        busy={busy}
        onConfirm={() => void discard()}
        onCancel={() => setConfirmingDiscard(false)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', gap: space.row, paddingTop: space.section },
  centred: { textAlign: 'center' },
  ring: { width: size.timerRing, height: size.timerRing, justifyContent: 'center' },
  ringInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookLine: { flexDirection: 'row', alignItems: 'center', gap: space.rowWide },
  footer: { gap: space.row, paddingTop: space.row },
})
