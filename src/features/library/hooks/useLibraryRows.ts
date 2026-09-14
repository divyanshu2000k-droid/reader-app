/**
 * src/features/library/hooks/useLibraryRows.ts
 *
 * The Library's data, read from SQLite. Never cached in a store: the database is the truth
 * (06-CONVENTIONS, State), and a store holding a copy is a store that goes stale.
 *
 * - **Loads once when the tab is chosen, and again after any write**: at once if this screen
 *   is focused (an Undo toast raised here), else when it regains focus (a delete on book
 *   detail). Nothing written, nothing re-read (ui/useReloadOnChange.ts). It used to query
 *   twice on every open, because `useFocusEffect` also fires on mount.
 * - **A tab only ever shows its own result.** The previous tab's rows used to stay on screen
 *   under the new chip until the new query answered (`tabData.ts`).
 * - **No loading spinner over the reader's own data** (rule 1). Skeleton rows appear only past
 *   400 ms, which `SkeletonGate` enforces.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { getLibraryRows, hasAnyBooks, type LibraryRow } from '../queries'
import { viewForTab, type TabResult } from '../tabData'
import type { ReadStatus } from '@/db/schema'
import { devTimed } from '@/lib/devLog'
import { appError, type AppError } from '@/lib/result'
import { useReloadOnChange } from '@/ui/useReloadOnChange'

export interface LibraryData {
  /** Null until THIS tab's query has answered. */
  readonly rows: readonly LibraryRow[] | null
  /** Null until known. False means this tab is empty, not the library. */
  readonly libraryEmpty: boolean | null
  readonly error: AppError | null
  readonly reload: () => void
}

export function useLibraryRows(status: ReadStatus): LibraryData {
  const [result, setResult] = useState<TabResult<ReadStatus, LibraryRow> | null>(null)
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
        // Timed in development: the 2000-book budget is a number, not a feeling.
        const rows = await devTimed(`library rows ${status}`, () => getLibraryRows(status))
        // Only asked when the tab has nothing: an empty tab and an empty library need
        // different words, and this is one indexed row rather than a count.
        const libraryEmpty = rows.length === 0 ? !(await hasAnyBooks()) : false
        if (cancelled || !alive.current) return
        setResult({ status, rows, libraryEmpty })
        setError(null)
      } catch (cause) {
        if (cancelled || !alive.current) return
        // The library is the reader's own data, so a failure here is worth showing rather
        // than leaving an empty list that looks like an empty library.
        setError(
          appError('recoverable', 'Could not open your library', {
            safe: 'Nothing was changed.',
            cause,
          }),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, nonce])

  // Coming back from book detail, where the book may have been removed or moved, and the
  // Undo toast raised here after a removal: both are writes (ui/useReloadOnChange.ts).
  useReloadOnChange(reload)

  return { ...viewForTab(result, status), error, reload }
}
