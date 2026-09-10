/**
 * src/ui/toastQueue.ts
 *
 * The toast queue's rules, as a pure reducer, so they are asserted under `node --test`
 * rather than argued in a comment. `Toast.tsx` holds the state and the timers and calls
 * this for every transition.
 *
 * ─── AN UNDO THAT FAILS MUST SAY SO ───────────────────────────────────────────
 *
 * The undo callback used to be `() => void`. It had nowhere to put a failure, so a restore
 * that failed (a clash with something added since, a parent deleted meanwhile) vanished
 * with the toast: the reader tapped Undo, the toast went away, and nothing came back. That
 * is rule 2 failing silently at the one moment the reader is trying to recover.
 *
 * So an undo returns a `Result`, and:
 *   - while it runs, the toast stays up and its timer cannot dismiss it;
 *   - success removes it;
 *   - failure REPLACES it in place with what went wrong and what is still safe, at the
 *     front of the queue where the reader is looking, not appended behind other toasts.
 */

import type { AppError, Result } from '@/lib/result'

/** A destructive action's reversal. Must report whether it worked. */
export type UndoAction = () => Promise<Result<unknown>>

export interface QueuedToast {
  /** Local only: the React key, and what a timer or a tap refers to. */
  readonly id: number
  readonly message: string
  /** Null for a plain confirmation or an error, which offer nothing to tap. */
  readonly onUndo: UndoAction | null
  /** True from the tap on Undo until the undo resolves. */
  readonly undoing: boolean
}

export type ToastEvent =
  | {
      readonly type: 'show'
      readonly id: number
      readonly message: string
      readonly onUndo: UndoAction | null
    }
  /** The display timer for `id` ran out. */
  | { readonly type: 'expire'; readonly id: number }
  | { readonly type: 'undoStarted'; readonly id: number }
  | { readonly type: 'undoSucceeded'; readonly id: number }
  | {
      readonly type: 'undoFailed'
      readonly id: number
      /** The error toast's own id, so it gets a fresh timer rather than the remainder. */
      readonly failureId: number
      readonly message: string
    }

export function toastQueue(
  queue: readonly QueuedToast[],
  event: ToastEvent,
): readonly QueuedToast[] {
  switch (event.type) {
    case 'show':
      return [
        ...queue,
        { id: event.id, message: event.message, onUndo: event.onUndo, undoing: false },
      ]

    case 'expire':
      // An undo in flight keeps its toast. Dismissing it would hide the only place its
      // failure can be reported.
      return queue.filter((t) => t.id !== event.id || t.undoing)

    case 'undoStarted':
      return queue.map((t) => (t.id === event.id && canUndo(t) ? { ...t, undoing: true } : t))

    case 'undoSucceeded':
      return queue.filter((t) => t.id !== event.id)

    case 'undoFailed': {
      const failure: QueuedToast = {
        id: event.failureId,
        message: event.message,
        onUndo: null,
        undoing: false,
      }
      return queue.some((t) => t.id === event.id)
        ? queue.map((t) => (t.id === event.id ? failure : t))
        : [failure, ...queue]
    }
  }
}

/** Whether a tap on Undo should run it: it has one, and it is not already running. */
export function canUndo(toast: QueuedToast | undefined): boolean {
  return toast !== undefined && toast.onUndo !== null && !toast.undoing
}

/** What happened, then what is still safe. The error copy rule from strings.ts. */
export function undoFailureMessage(error: AppError): string {
  return error.safe ? `${error.message}. ${error.safe}` : `${error.message}.`
}
