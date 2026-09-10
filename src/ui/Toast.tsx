/**
 * src/ui/Toast.tsx
 *
 * Undo toast. Sits above the tab bar, lives 5 seconds, tap Undo to reverse.
 *
 * EVERY destructive action gets one of these. That is a global rule, not a per-screen
 * choice, so the provider lives at the root and any feature can call `showUndo`.
 *
 * The undo callback is what actually protects the reader, so a toast that is dismissed
 * or times out must never run it. Only an explicit tap on Undo does.
 *
 * THIS IS A QUEUE, NOT A SLOT. Delete two sessions in quick succession and each delete
 * keeps its own undo for its own full window. A screen that deletes many rows at once
 * should raise ONE toast whose undo reverses the batch; that is the caller's job.
 *
 * AN UNDO REPORTS WHETHER IT WORKED. `showUndo` takes a function returning a `Result`.
 * It used to take `() => void`, so a restore that failed (a clash with something added
 * since, a parent deleted meanwhile) vanished with the toast and nothing came back. Now the
 * toast stays up while the undo runs, and a failure takes its place saying what happened
 * and what is still safe. The rules live in `toastQueue.ts`, with tests.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { font, opacity, radius, rules, size, space, typeStyle } from './theme'
import {
  canUndo,
  toastQueue,
  undoFailureMessage,
  type QueuedToast,
  type UndoAction,
} from './toastQueue'
import { useColors } from './useTheme'
import { appError, err, type Result } from '@/lib/result'
import { actions, errors } from '@/lib/strings'

export type { UndoAction }

interface ToastApi {
  /** A plain confirmation with no action. */
  show: (message: string) => void
  /**
   * A destructive action with its undo. The undo runs only on an explicit tap, and must
   * return its `Result` — pass `() => restoreRow('sessions', id)`, not a function that
   * swallows it.
   */
  showUndo: (message: string, onUndo: UndoAction) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const [queue, dispatch] = useReducer(toastQueue, [])
  const lastId = useRef(0)
  const nextId = useCallback(() => {
    lastId.current += 1
    return lastId.current
  }, [])
  /** Undos in flight. A ref, so two taps in one frame cannot both start one. */
  const running = useRef(new Set<number>())

  const current = queue[0] ?? null
  const currentId = current?.id
  const currentUndoing = current?.undoing ?? false

  // One timer per displayed toast, keyed by its id, so each gets its own full window. None
  // while its undo runs: dismissing it would hide the one place its failure can appear.
  useEffect(() => {
    if (currentId === undefined || currentUndoing) return
    const timer = setTimeout(() => dispatch({ type: 'expire', id: currentId }), rules.toastMs)
    return () => clearTimeout(timer)
  }, [currentId, currentUndoing])

  const runUndo = useCallback(
    async (toast: QueuedToast) => {
      if (!canUndo(toast) || toast.onUndo === null || running.current.has(toast.id)) return
      running.current.add(toast.id)
      dispatch({ type: 'undoStarted', id: toast.id })

      let result: Result<unknown>
      try {
        result = await toast.onUndo()
      } catch (cause) {
        result = err(
          appError('recoverable', errors.undoFailed.message, {
            safe: errors.undoFailed.safe,
            cause,
          }),
        )
      }
      running.current.delete(toast.id)

      if (result.ok) dispatch({ type: 'undoSucceeded', id: toast.id })
      else {
        dispatch({
          type: 'undoFailed',
          id: toast.id,
          failureId: nextId(),
          message: undoFailureMessage(result.error),
        })
      }
    },
    [nextId],
  )

  const api = useMemo<ToastApi>(
    () => ({
      show: (message) => dispatch({ type: 'show', id: nextId(), message, onUndo: null }),
      showUndo: (message, onUndo) => dispatch({ type: 'show', id: nextId(), message, onUndo }),
    }),
    [nextId],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? (
        <View
          key={current.id}
          accessibilityLiveRegion="polite"
          style={[
            styles.wrap,
            {
              bottom: insets.bottom + space.bottomSafe + space.toastLift,
              backgroundColor: c.surfaceRaised,
              borderColor: c.borderStrong,
              borderRadius: radius.buttonSmall,
            },
          ]}
        >
          <Text
            numberOfLines={3}
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.body), styles.message, { color: c.text }]}
          >
            {current.message}
          </Text>
          {current.onUndo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actions.undo}
              accessibilityState={{ busy: current.undoing, disabled: current.undoing }}
              disabled={current.undoing}
              hitSlop={size.hitSlop}
              onPress={() => void runUndo(current)}
              style={current.undoing ? styles.busy : null}
            >
              <Text
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.toastAction), { color: c.accentInk }]}
              >
                {actions.undo}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ToastContext.Provider>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.screen,
    right: space.screen,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.toastGap,
    paddingHorizontal: space.toastPadX,
    paddingVertical: space.toastPadY,
    borderWidth: 1,
  },
  message: { flex: 1 },
  busy: { opacity: opacity.disabled },
})
