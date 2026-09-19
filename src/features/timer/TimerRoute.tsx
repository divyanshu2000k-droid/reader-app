/**
 * Opens the timer: shows the one already running, or starts one on a book.
 *
 * **At most one timer runs at a time.** If the service already holds a run, `?book=` is
 * ignored and that one is shown. Two open timed sessions would both look like "the" open
 * session to the launch recovery gate, and the reader would be asked about one arbitrarily.
 *
 * The route decides what to open; it does not own the timer. `timerService.ts` does, and
 * outlives this screen — leaving the timer keeps it running.
 */

import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'

import { NotificationPriming, shouldPrime } from './NotificationPriming'
import { TimerScreen } from './TimerScreen'
import { getTimerContext } from './queries'
import {
  begin,
  getTimerSnapshot,
  getVanishedTimer,
  renotify,
  resumeFromDisk,
} from './timerService'
import { appError, type AppError } from '@/lib/result'
import { EmptyState } from '@/ui/EmptyState'
import { Header, HeaderIconButton } from '@/ui/Header'
import { InlineError } from '@/ui/InlineError'
import { Screen } from '@/ui/Screen'
import { SkeletonGate } from '@/ui/Skeleton'

type Ready = 'loading' | 'running' | 'nothing'

export function TimerRoute() {
  const router = useRouter()
  const { book: bookParam } = useLocalSearchParams<{ book?: string }>()
  const bookId = typeof bookParam === 'string' ? bookParam : ''
  const [ready, setReady] = useState<Ready>(() =>
    getTimerSnapshot() === null ? 'loading' : 'running',
  )
  const [error, setError] = useState<AppError | null>(null)
  const [priming, setPriming] = useState(false)
  // Opening this route can WRITE a session row. Guarded so React's development double-invoke,
  // or a re-render while the write is in flight, cannot start two.
  const opened = useRef(false)

  useEffect(() => {
    if (opened.current) return
    opened.current = true
    let cancelled = false
    void (async () => {
      try {
        // The service may already hold a run — from this session, or picked up at launch.
        if (getTimerSnapshot() !== null || (await resumeFromDisk()) !== null) {
          if (!cancelled) setReady('running')
          return
        }
        if (!bookId) {
          if (!cancelled) setReady('nothing')
          return
        }
        const context = await getTimerContext(bookId)
        if (cancelled) return
        if (context === null) {
          setReady('nothing')
          return
        }
        const started = await begin(context)
        if (cancelled) return
        if (!started.ok) {
          setError(started.error)
          return
        }
        setReady('running')
        // After the timer is running, never as a gate in front of it: the reader tapped
        // Start to start reading, not to answer a question about Android.
        if (await shouldPrime()) setPriming(true)
      } catch (cause) {
        if (cancelled) return
        setError(
          appError('recoverable', 'Could not start the timer', {
            safe: 'Nothing was changed. You can still log this session by hand.',
            cause,
          }),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId])

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'))
  // Read at render: the service sets it when a running timer's session disappears.
  const gone = getVanishedTimer()

  if (ready === 'running') {
    return (
      <>
        <TimerScreen />
        <NotificationPriming
          visible={priming}
          onDone={() => {
            setPriming(false)
            // The timer started BEFORE this sheet, so its first notification was posted
            // without the permission and refused. Ask again now the reader has answered;
            // `renotify` does nothing if they said no, and nothing if the timer has ended.
            renotify()
          }}
        />
      </>
    )
  }
  return (
    <Screen glow="upper">
      <Header
        compact
        title="Timer"
        left={<HeaderIconButton icon="back" accessibilityLabel="Back" onPress={back} />}
      />
      {error ? <InlineError error={error} /> : null}
      <SkeletonGate loading={ready === 'loading' && error === null} fallback={null}>
        {ready === 'nothing' ? (
          // A timer that STOPPED because its book was removed is a different answer from
          // "you have not started one". The reader needs to know where their session went,
          // and that restoring the book brings it back. Owner's decision, 2026-09-19.
          gone ? (
            <EmptyState
              title="That book was removed"
              body={`Your session went to Recently Deleted with ${gone.bookTitle}. Restore the book and the session comes back with it.`}
              actionLabel="Back to the library"
              onAction={back}
            />
          ) : (
            <EmptyState
              title="No book to time"
              body="Open a book and start the timer from there."
              actionLabel="Back to the library"
              onAction={back}
            />
          )
        ) : null}
      </SkeletonGate>
    </Screen>
  )
}
