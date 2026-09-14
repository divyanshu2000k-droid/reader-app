/**
 * src/features/session/hooks/useSessionTarget.ts
 *
 * The logger's and Session complete's data: a new session for a book, or an existing session.
 *
 * Three states, as on book detail:
 *   - `undefined`, not read yet. Nothing shows for the first 400 ms (SkeletonGate).
 *   - `null`, the book or session is not in the library any more: deleted on another screen,
 *     or a stale route. It gets its own screen with a way back.
 *   - a context to draw.
 *
 * Loaded ONCE. A form must not reload under the reader's typing, so there is no refocus
 * reload here, unlike book detail.
 */

import { useCallback, useEffect, useState } from 'react'

import {
  getEditContext,
  getLogContextForBook,
  type EditContext,
  type LogContext,
} from '../queries'
import { appError, type AppError } from '@/lib/result'

export type SessionTarget =
  | { readonly kind: 'new'; readonly bookId: string }
  | { readonly kind: 'edit'; readonly sessionId: string }

export type LoadedContext =
  | { readonly kind: 'new'; readonly context: LogContext }
  | { readonly kind: 'edit'; readonly context: EditContext }

export function useSessionTarget(target: SessionTarget | null) {
  const [loaded, setLoaded] = useState<LoadedContext | null | undefined>(undefined)
  const [error, setError] = useState<AppError | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const kind = target?.kind ?? null
  const id = target === null ? null : target.kind === 'new' ? target.bookId : target.sessionId

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        let next: LoadedContext | null = null
        if (kind === 'new' && id) {
          const context = await getLogContextForBook(id)
          next = context ? { kind: 'new', context } : null
        } else if (kind === 'edit' && id) {
          const context = await getEditContext(id)
          next = context ? { kind: 'edit', context } : null
        }
        if (cancelled) return
        setLoaded(next)
        setError(null)
      } catch (cause) {
        if (cancelled) return
        setError(
          appError('recoverable', 'Could not open this session', {
            safe: 'Nothing was changed.',
            cause,
          }),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [kind, id, nonce])

  return { loaded, error, reload }
}
