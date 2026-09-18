/**
 * src/features/notes/hooks/useBookNotes.ts
 *
 * The notes list's data. Three states, kept distinct because they render differently:
 *   - `undefined` — not read yet. Nothing shows for the first 400ms (SkeletonGate).
 *   - `null` — read, and the book is not in the library. An ordinary answer with its own
 *     screen, never an error and never a blank.
 *   - a `NotesForBook` — draw it.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { getNotesForBook, type NotesForBook } from '../queries'
import { appError, type AppError } from '@/lib/result'
import { useReloadOnChange } from '@/ui/useReloadOnChange'

export interface BookNotesData {
  readonly data: NotesForBook | null | undefined
  readonly error: AppError | null
  readonly reload: () => void
}

export function useBookNotes(bookId: string): BookNotesData {
  const [data, setData] = useState<NotesForBook | null | undefined>(undefined)
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
        const next = await getNotesForBook(bookId)
        if (cancelled || !alive.current) return
        setData(next)
        setError(null)
      } catch (cause) {
        if (cancelled || !alive.current) return
        setError(
          appError('recoverable', 'Could not open your notes', {
            safe: 'Nothing was changed. Your notes are still saved.',
            cause,
          }),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId, nonce])

  // A write anywhere, including the Undo toast raised by this screen after a delete.
  useReloadOnChange(reload)

  return { data, error, reload }
}
