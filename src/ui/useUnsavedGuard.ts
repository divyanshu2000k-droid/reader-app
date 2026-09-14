/**
 * src/ui/useUnsavedGuard.ts
 *
 * "Back always works and never loses unsaved input. Warn before discarding." (04-SCREENS,
 * global rules.)
 *
 * While `dirty` is true, leaving the screen by ANY route (the header back button, Android's
 * back gesture, a `router.back()`) is held, and the screen shows a confirm. Discard lets the
 * held navigation through; Keep editing drops it.
 *
 * A screen that has just saved sets `dirty` false before it navigates away, or it would be
 * asked whether to discard the thing it saved. `leave` does both in the right order.
 */

import { useNavigation } from 'expo-router'
import { usePreventRemove } from 'expo-router/build/react-navigation/core'
import { useCallback, useRef, useState } from 'react'

type HeldAction = Parameters<Parameters<typeof usePreventRemove>[1]>[0]['data']['action']

export function useUnsavedGuard(dirty: boolean) {
  const navigation = useNavigation()
  const [held, setHeld] = useState<HeldAction | null>(null)
  // Set by `leave`, read synchronously by the guard: state would still be `dirty` for the
  // render in which the screen navigates away.
  const released = useRef(false)

  usePreventRemove(dirty, ({ data }) => {
    if (released.current) {
      navigation.dispatch(data.action)
      return
    }
    setHeld(data.action)
  })

  const discard = useCallback(() => {
    const action = held
    setHeld(null)
    released.current = true
    if (action) navigation.dispatch(action)
  }, [held, navigation])

  const keep = useCallback(() => setHeld(null), [])

  /** Navigate away without asking: after a save, or a delete the reader confirmed. */
  const leave = useCallback((go: () => void) => {
    released.current = true
    go()
  }, [])

  return { asking: held !== null, discard, keep, leave }
}
