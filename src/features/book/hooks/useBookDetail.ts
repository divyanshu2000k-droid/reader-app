/**
 * src/features/book/hooks/useBookDetail.ts
 *
 * Book detail's data: the book, its reads, and the current read's sessions.
 *
 * Three states, kept distinct because they render differently:
 *   - `undefined` — not read yet. Nothing shows for the first 400ms (SkeletonGate).
 *   - `null` — read, and the book is not in the library: deleted, or a stale route. That is
 *     an ordinary answer with its own screen, never an error and never a blank.
 *   - a `BookDetail` — draw it.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getBookDetail,
  getSessionsForRead,
  type BookDetail,
  type SessionEntry,
} from '../queries'
import { ensureLocalCover } from '@/db/coverFiles'
import { devTimed } from '@/lib/devLog'
import { appError, type AppError } from '@/lib/result'
import { useReloadOnChange } from '@/ui/useReloadOnChange'

export interface BookDetailData {
  readonly detail: BookDetail | null | undefined
  readonly sessions: readonly SessionEntry[]
  readonly error: AppError | null
  readonly reload: () => void
}

export function useBookDetail(bookId: string): BookDetailData {
  const [detail, setDetail] = useState<BookDetail | null | undefined>(undefined)
  const [sessions, setSessions] = useState<readonly SessionEntry[]>([])
  const [error, setError] = useState<AppError | null>(null)
  const [nonce, setNonce] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await devTimed('book detail', () => getBookDetail(bookId))
        const nextSessions = next ? await getSessionsForRead(next.current.readId) : []
        if (cancelled || !alive.current) return
        setDetail(next)
        setSessions(nextSessions)
        setError(null)
        // A cover that did not download when the book was added (offline then, or a server
        // error) is tried again now, once per launch. Covers must survive offline
        // (db/coverFiles.ts); the write it makes reloads this screen with the local copy.
        if (next && next.book.coverUrl !== null && next.book.coverLocalPath === null) {
          void ensureLocalCover(next.book.id, next.book.coverUrl)
        }
      } catch (cause) {
        if (cancelled || !alive.current) return
        setError(
          appError('recoverable', 'Could not open this book', {
            safe: 'Nothing was changed.',
            cause,
          }),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId, nonce])

  // A write anywhere, including an Undo toast on this very screen: reload now if focused,
  // else when it is focused again (ui/useReloadOnChange.ts). Undo restoring a session used
  // to leave it missing from this list, because the screen never lost focus.
  useReloadOnChange(reload)

  return { detail, sessions, error, reload }
}
