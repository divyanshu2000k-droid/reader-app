/**
 * src/features/timer/timerService.ts
 *
 * THE RUNNING TIMER, OWNED ABOVE THE SCREEN.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Until 2026-09-18 the tick, the heartbeat, the notification refresh and the notification's
 * action listener all lived in `useTimer`, which lives in `TimerScreen`. Navigating away
 * unmounted the screen, React cleaned up every effect, and all four stopped — while the
 * session stayed open.
 *
 * Measured, not inferred (`scripts/device/s6_audit_background.py`): a session open for three
 * minutes offered **one** minute, because the heartbeat froze the moment the screen was left.
 * The reader's most likely action after starting a timer is to leave the screen and read, so
 * the feature stopped working exactly when it was supposed to start.
 *
 * Nothing failed. The arithmetic was right the whole time, so 478 node tests and six emulator
 * scripts passed — every one of which drives the timer FROM the timer screen and never
 * leaves.
 *
 * ─── SO THE RUNTIME IS A MODULE, NOT A COMPONENT ─────────────────────────────
 *
 * A module-level singleton lives for the life of the JS context, which is what a foreground
 * service keeps alive. The screen becomes a VIEW: it subscribes, renders, and sends intents.
 * It owns no interval and no listener, so unmounting it costs nothing.
 *
 * Subscribe/notify follows `db/changes.ts`, which solved the same shape of problem for the
 * library. No React here — this file must be usable from `app/_layout.tsx` at launch, before
 * any timer screen exists.
 */

import {
  clearRun,
  finishTimer,
  getOpenTimedSession,
  getTimerContextForRead,
  isSessionLive,
  readRun,
  saveRun,
  startTimer,
  type TimerBook,
  type TimerContext,
} from './queries'
import { AppState, type NativeEventSubscription } from 'react-native'

import { subscribeDataChanges } from '@/db/changes'
import { heartbeatDue, type TimerRun } from '@/domain/timerRun'
import {
  elapsedSeconds,
  pause as pauseSegments,
  resume as resumeSegments,
  status as runStatus,
  stop as stopSegments,
  type TimerStatus,
} from '@/domain/timerState'
import { now } from '@/lib/dates'
import { devLog } from '@/lib/devLog'
import { appError, err, ok, type Result } from '@/lib/result'
import { rules } from '@/ui/theme'
import {
  TIMER_ACTION,
  clearTimerNotification,
  onTimerAction,
  showTimerNotification,
} from '@/ui/timerNotification'

/** What the screen renders. Immutable: replaced on every change, never mutated. */
export interface TimerSnapshot {
  readonly run: TimerRun
  readonly book: TimerBook
  readonly status: TimerStatus
  /** Where the reader was when it started, for the screen's caption. */
  readonly fromPosition: number | null
}

type Listener = () => void

const listeners = new Set<Listener>()
let snapshot: TimerSnapshot | null = null
let ticker: ReturnType<typeof setInterval> | null = null
let responseSub: { remove: () => void } | null = null
let changesSub: (() => void) | null = null
let appStateSub: NativeEventSubscription | null = null

/**
 * Set when a running timer's session disappeared underneath it — which is what removing the
 * book does, through the cascade. Read by the screen so it can say so rather than showing a
 * ring for a session that no longer exists. Cleared when the next timer starts.
 */
let vanished: { readonly bookTitle: string } | null = null

export function getVanishedTimer(): { readonly bookTitle: string } | null {
  return vanished
}

export function subscribeTimer(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getTimerSnapshot(): TimerSnapshot | null {
  return snapshot
}

/** Seconds of reading right now. Derived; the tick only decides how often it is redrawn. */
export function currentSeconds(): number {
  return snapshot === null ? 0 : elapsedSeconds(snapshot.run, now())
}

function emit(): void {
  // Isolated, exactly as in db/changes.ts: a listener that throws must not stop the timer.
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      /* a broken subscriber is not the timer's problem */
    }
  }
}

function setSnapshot(next: TimerSnapshot | null): void {
  snapshot = next
  emit()
}

// ─── THE LOOP ────────────────────────────────────────────────────────────────

function startTicking(): void {
  if (ticker !== null) return
  ticker = setInterval(() => {
    const current = snapshot
    if (current === null) return
    const at = now()
    const running = runStatus(current.run) === 'running'
    const beat = running && heartbeatDue(current.run, at)
    const run: TimerRun = beat ? { ...current.run, lastBeatAt: at } : current.run

    /**
     * A NEW snapshot object every tick, even when nothing about the state changed.
     *
     * `useSyncExternalStore` compares snapshots with `Object.is` and skips the re-render when
     * they match. Emitting without replacing the object meant the subscriber was notified and
     * React bailed out, so the clock froze on screen while the timer ran: a check caught it
     * saving 46 seconds while the screen showed 30. The elapsed time is derived at render, so
     * a new reference is exactly what "one second has passed" means here.
     */
    snapshot = { ...current, run }
    emit()
    if (beat) {
      // Dev-only, and it earns its keep: this is the only way to see WHEN the heartbeat
      // stops. A frozen heartbeat is invisible in the database — the last value written
      // looks exactly like a value written on purpose — and reading the database means
      // force-stopping the app, which ends the thing being measured.
      devLog('timer heartbeat', { at, elapsed: elapsedSeconds(run, at) })
      void saveRun(run)
    }
  }, rules.timerTickMs)
}

function stopTicking(): void {
  if (ticker === null) return
  clearInterval(ticker)
  ticker = null
}

/**
 * The notification's Pause and Resume buttons, registered ONCE for the app's lifetime.
 *
 * Finish is deliberately not handled: finishing routes to Session complete, and a screen
 * cannot be pushed from a notification tapped while the app is not in front. Tapping Finish
 * opens the app, where Finish is one tap away and the reader sees what they confirm.
 */
/**
 * The notification's buttons.
 *
 * Native now, through `modules/reading-service`: the foreground service owns the
 * notification, so it owns the `PendingIntent`s too. That is not a detail — the buttons have
 * to work when the app is not in front and no screen is mounted, which is the entire reason
 * the notification exists.
 *
 * **Finish was wired to nothing until 2026-09-19.** The button was built, read off a
 * screenshot of the expanded shade, and written up as working; the listener handled `pause`
 * and `resume` and fell through on `finish`. A button that does nothing is worse than no
 * button, because the reader believes the session ended.
 */
function listenForActions(): void {
  if (responseSub !== null) return
  responseSub = onTimerAction((action) => {
    if (action === TIMER_ACTION.pause) pause()
    else if (action === TIMER_ACTION.resume) resume()
    else if (action === TIMER_ACTION.finish) {
      /**
       * No page, because the notification cannot ask for one.
       *
       * `finish(null)` saves the duration and leaves the position alone, which is the half
       * that must never be lost. The reader can add where they got to from book detail
       * afterwards. Finishing from the shade and being asked nothing is the point of the
       * button: they have stopped reading and put the phone down.
       */
      void finish(null)
    }
  })
}

/**
 * Post or replace the notification for whatever the timer is doing now.
 *
 * Exported because two things outside this module have to be able to ask for it, and both are
 * cases where the notification does not exist yet through no fault of the timer:
 *
 *   - **The reader has just granted the notification permission.** The priming sheet is shown
 *     AFTER the timer starts, so the first post of a reader's very first session is always
 *     refused: there was no permission when `adopt` ran. Nothing retried, so that session ran
 *     with no notification and therefore NO FOREGROUND SERVICE — the whole point of the
 *     permission — and nothing logged or threw. Measured on a phone on 2026-09-19: permission
 *     granted, timer running, 60 seconds of polling, zero notifications.
 *   - **The reader granted it from Settings** while a timer was already running.
 *
 * Idempotent: the notification has a fixed id, so posting again replaces it.
 */
export function renotify(): void {
  const current = snapshot
  if (current === null) return
  void showTimerNotification({
    title: current.book.title,
    seconds: elapsedSeconds(current.run, now()),
    running: runStatus(current.run) === 'running',
  })
}

// ─── INTENTS ─────────────────────────────────────────────────────────────────

/**
 * Beat when the app leaves the foreground, re-post the notification when it comes back.
 *
 * **This listener used to live in `useTimer`, and therefore in the timer SCREEN** — which
 * meant the beat-before-being-killed only happened if the reader was still looking at the
 * timer when they backgrounded the app. Leaving the screen and then backgrounding, which is
 * the ordinary way to read with a timer running, got no final beat at all. That is audit
 * finding 1 again, in the one listener the fix for it left behind.
 *
 * The `active` half is the self-healing one: a permission granted in Settings, or in the
 * priming sheet, costs the reader nothing beyond their next return to the app.
 */
function watchAppState(): void {
  if (appStateSub !== null) return
  appStateSub = AppState.addEventListener('change', (next) => {
    if (snapshot === null) return
    if (next === 'active') renotify()
    else beatNow()
  })
}

/** Adopt a run as the live one: notification up, ticking, listening, watching. */
function adopt(run: TimerRun, book: TimerBook, fromPosition: number | null): void {
  vanished = null
  setSnapshot({ run, book, status: runStatus(run), fromPosition })
  listenForActions()
  startTicking()
  watchForDeletion()
  watchAppState()
  renotify()
}

/**
 * Stop if the session is deleted underneath us.
 *
 * Removing a book soft-deletes its reads and sessions (the cascade in `write.ts`), so a timer
 * running on that book is suddenly counting into a row that can never be saved: `finishTimer`
 * would be refused by the parent guard and the reader would meet an inline error at the end of
 * a session instead of the beginning.
 *
 * `db/changes.ts` already announces every committed write, so the timer listens rather than
 * polling. The owner's decision, 2026-09-19: **the timer stops and says so.** The session went
 * to Recently Deleted with the book, and restoring the book brings it back — so nothing is
 * lost, and the reader is told at the moment it happens.
 */
function watchForDeletion(): void {
  if (changesSub !== null) return
  changesSub = subscribeDataChanges(() => {
    const current = snapshot
    if (current === null) return
    void isSessionLive(current.run.sessionId).then((live) => {
      if (live) return
      // Re-read: an await means the timer may have been finished normally in the meantime.
      const still = snapshot
      if (still === null || still.run.sessionId !== current.run.sessionId) return
      vanished = { bookTitle: still.book.title }
      release()
    })
  })
}

/** Put the timer down without touching the session row. */
function release(): void {
  stopTicking()
  changesSub?.()
  changesSub = null
  appStateSub?.remove()
  appStateSub = null
  setSnapshot(null)
  void clearTimerNotification()
}

export async function begin(context: TimerContext): Promise<Result<TimerSnapshot>> {
  const started = await startTimer(context)
  if (!started.ok) return started
  adopt(started.value.run, context.book, context.fromPosition)
  // `adopt` always sets a snapshot, so this cannot be null here.
  const live = snapshot
  return live === null
    ? err(
        appError('recoverable', 'Could not start the timer', { safe: 'Nothing was changed.' }),
      )
    : ok(live)
}

/**
 * Adopt a session that is open on disk but not held by this module.
 *
 * **Deliberately NOT called at launch.** On a cold start, an open session means the process
 * died — the singleton is empty because the JS context is new — and that is exactly the
 * launch recovery gate's job (`features/launch`). Resuming here as well would put a running
 * timer behind a sheet asking whether to keep it: two answers to one question.
 *
 * While the process LIVES, this is never needed: the foreground service keeps the context
 * alive, so the module still holds the run however long the app is backgrounded.
 *
 * It exists for the narrow case where a session is somehow still open after the gates have
 * passed. Showing the reader their timer beats showing them nothing.
 */
export async function resumeFromDisk(): Promise<TimerSnapshot | null> {
  if (snapshot !== null) return snapshot
  const open = await getOpenTimedSession()
  if (open === null) return null
  const context = await getTimerContextForRead(open.readId)
  if (context === null) return null
  const stored = await readRun(open.sessionId)
  const run: TimerRun = stored ?? {
    sessionId: open.sessionId,
    readId: open.readId,
    bookId: context.book.id,
    segments: [{ startedAt: open.occurredAt, endedAt: null }],
    lastBeatAt: null,
  }
  adopt(run, context.book, context.fromPosition)
  return snapshot
}

export function pause(): void {
  const current = snapshot
  if (current === null) return
  const segments = pauseSegments(current.run, now())
  // Null is the second tap of a double tap, not an error.
  if (segments === null) return
  const run: TimerRun = { ...current.run, segments, lastBeatAt: now() }
  setSnapshot({ ...current, run, status: runStatus(run) })
  void saveRun(run)
  renotify()
}

export function resume(): void {
  const current = snapshot
  if (current === null) return
  const segments = resumeSegments(current.run, now())
  if (segments === null) return
  const run: TimerRun = { ...current.run, segments, lastBeatAt: now() }
  setSnapshot({ ...current, run, status: runStatus(run) })
  void saveRun(run)
  renotify()
}

/** Beat now, for the moment the app is backgrounded — the likeliest instant to be killed. */
export function beatNow(): void {
  const current = snapshot
  if (current === null || runStatus(current.run) !== 'running') return
  const run: TimerRun = { ...current.run, lastBeatAt: now() }
  snapshot = { ...current, run }
  void saveRun(run)
}

export async function finish(toPosition: number | null): Promise<Result<unknown>> {
  const current = snapshot
  if (current === null) {
    return err(
      appError('recoverable', 'No timer is running', {
        safe: 'Nothing was changed. Log this session by hand from the book.',
      }),
    )
  }
  const segments = stopSegments(current.run, now())
  const closed: TimerRun = { ...current.run, segments }
  const seconds = elapsedSeconds(closed, now())
  // Released BEFORE the write, so nothing can re-post the notification behind it.
  release()
  return finishTimer(current.run.sessionId, seconds, toPosition)
}

export async function discard(): Promise<string | null> {
  const current = snapshot
  if (current === null) return null
  const sessionId = current.run.sessionId
  release()
  await clearRun(sessionId)
  return sessionId
}

/** Test seam: drop everything without touching the database. */
export function resetForTests(): void {
  stopTicking()
  responseSub?.remove()
  responseSub = null
  changesSub?.()
  changesSub = null
  appStateSub?.remove()
  appStateSub = null
  snapshot = null
  vanished = null
  listeners.clear()
}
