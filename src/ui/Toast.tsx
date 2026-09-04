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
 * THIS IS A QUEUE, NOT A SLOT, AND THAT IS THE WHOLE POINT.
 *
 * It used to hold one toast and replace it. Delete two sessions in quick succession —
 * the most ordinary interaction there is in a list — and the first delete's undo was
 * discarded before the reader could reach it. No warning, no trace, and the row was
 * already gone. "Undo on every destructive action" is non-negotiable rule 2, and the one
 * component responsible for it was dropping undos.
 *
 * Each toast now waits its turn and gets its full window. A screen that deletes many
 * rows at once should raise ONE toast whose undo reverses the batch, rather than N
 * toasts the reader has to sit through; that is the caller's job, not this file's.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { actions } from '@/lib/strings'
import { font, radius, rules, size, space, typeStyle } from './theme'
import { useColors } from './useTheme'

interface ToastState {
  /** Local only, for the React key and for identifying the head across renders. */
  readonly id: number
  readonly message: string
  readonly onUndo?: () => void
}

interface ToastApi {
  /** A plain confirmation with no action. */
  show: (message: string) => void
  /** A destructive action with its undo. The undo runs only on an explicit tap. */
  showUndo: (message: string, onUndo: () => void) => void
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
  const [queue, setQueue] = useState<readonly ToastState[]>([])
  const nextId = useRef(0)

  const current = queue[0] ?? null

  const enqueue = useCallback((toast: Omit<ToastState, 'id'>) => {
    nextId.current += 1
    setQueue((q) => [...q, { ...toast, id: nextId.current }])
  }, [])

  /** Removes the head. Never runs its undo — only an explicit tap does that. */
  const dismissCurrent = useCallback(() => {
    setQueue((q) => q.slice(1))
  }, [])

  // One timer per displayed toast, keyed by its id, so each one gets its own full
  // window rather than inheriting what is left of the previous one's.
  useEffect(() => {
    if (!current) return
    const timer = setTimeout(dismissCurrent, rules.toastMs)
    return () => clearTimeout(timer)
  }, [current, dismissCurrent])

  const api = useMemo<ToastApi>(
    () => ({
      show: (message) => enqueue({ message }),
      showUndo: (message, onUndo) => enqueue({ message, onUndo }),
    }),
    [enqueue],
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
            numberOfLines={2}
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.body), { flex: 1, color: c.text }]}
          >
            {current.message}
          </Text>
          {current.onUndo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actions.undo}
              hitSlop={size.hitSlop}
              onPress={() => {
                current.onUndo?.()
                dismissCurrent()
              }}
            >
              <Text
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.body, { weight: '700' }), { color: c.accentInk }]}
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
})
