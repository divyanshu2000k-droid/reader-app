/**
 * src/ui/Toast.tsx
 *
 * Undo toast. Sits above the tab bar, lives 5 seconds, swipe or tap to dismiss.
 *
 * EVERY destructive action gets one of these. That is a global rule, not a per-screen
 * choice, so the provider lives at the root and any feature can call `showUndo`.
 *
 * The undo callback is what actually protects the reader, so a toast that is dismissed
 * or times out must never run it. Only an explicit tap on Undo does.
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
import { font, radius, rules, space } from './theme'
import { useColors } from './useTheme'

interface ToastState {
  message: string
  onUndo?: () => void
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
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setToast(null)
  }, [])

  const present = useCallback(
    (next: ToastState) => {
      if (timer.current) clearTimeout(timer.current)
      setToast(next)
      timer.current = setTimeout(() => setToast(null), rules.toastMs)
    },
    [],
  )

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      show: (message) => present({ message }),
      showUndo: (message, onUndo) => present({ message, onUndo }),
    }),
    [present],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.wrap,
            {
              bottom: insets.bottom + space.bottomSafe + 56,
              backgroundColor: c.surfaceRaised,
              borderColor: c.borderStrong,
              borderRadius: radius.buttonSmall,
            },
          ]}
        >
          <Text
            numberOfLines={2}
            style={{ flex: 1, color: c.text, fontSize: font.body.size, fontWeight: '500' }}
          >
            {toast.message}
          </Text>
          {toast.onUndo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actions.undo}
              hitSlop={10}
              onPress={() => {
                toast.onUndo?.()
                dismiss()
              }}
            >
              <Text
                style={{ color: c.accentInk, fontSize: font.body.size, fontWeight: '700' }}
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
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
  },
})
