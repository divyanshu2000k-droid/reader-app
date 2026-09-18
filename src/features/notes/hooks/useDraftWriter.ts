/**
 * src/features/notes/hooks/useDraftWriter.ts
 *
 * KEEPS WHAT IS BEING TYPED. The rule it applies is in `noteDraft.ts` and tested there;
 * this hook is only the timer and the flush.
 *
 * Two things here are the feature, not plumbing:
 *
 * - **It flushes on unmount.** Backing out is exactly the case this exists for, and a
 *   debounce that only ever fires on a timer loses the last half-second of typing — the half
 *   the reader was in the middle of. The flush runs the write synchronously inside the
 *   cleanup (`saveDraft` reaches `runInTransaction` before its first await), so leaving the
 *   screen does not race the write.
 * - **`finish()` stops it dead.** Once the note is saved, deleted or discarded, the writer
 *   must never write again — including on the unmount that follows. See `draftAction`.
 */

import { useCallback, useEffect, useRef } from 'react'

import { DRAFT_SOURCE, draftAction, encodeDraft, type DraftPhase } from '../noteDraft'
import type { NoteForm } from '../noteForm'
import { clearDraft, saveDraft } from '../queries'

/**
 * Long enough that ordinary typing is not a write per keystroke, short enough that the app
 * being killed costs at most a few words. The unmount flush covers every ordinary exit.
 */
export const DRAFT_DEBOUNCE_MS = 500

export interface DraftWriter {
  /** Call after saving, deleting or discarding: no further write, ever, including the flush. */
  readonly finish: () => void
}

export function useDraftWriter(
  key: string | null,
  form: NoteForm,
  baseline: NoteForm,
): DraftWriter {
  const phase = useRef<DraftPhase>('editing')
  // What the flush writes. Updated in the effect below rather than during render, so the
  // unmount flush uses the last COMMITTED form, never one from a render React threw away.
  const latest = useRef({ key, form, baseline })

  const write = useCallback(() => {
    const { key: k, form: f, baseline: b } = latest.current
    if (k === null) return
    const action = draftAction(phase.current, f, b)
    if (action === 'save') void saveDraft(DRAFT_SOURCE, k, encodeDraft(f))
    else if (action === 'clear') void clearDraft(DRAFT_SOURCE, k)
  }, [])

  useEffect(() => {
    latest.current = { key, form, baseline }
    if (key === null || phase.current === 'finished') return
    const timer = setTimeout(write, DRAFT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [key, form, baseline, write])

  // Backing out: the pending write happens now rather than being cancelled with the screen.
  useEffect(
    () => () => {
      write()
    },
    [write],
  )

  const finish = useCallback(() => {
    phase.current = 'finished'
  }, [])

  return { finish }
}
