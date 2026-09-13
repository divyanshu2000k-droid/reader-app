/**
 * src/ui/useOnRefocus.ts
 *
 * Run `callback` when a screen comes BACK into focus, and not when it first mounts.
 *
 * `useFocusEffect` also fires on the first focus. Screens that load in an effect and reload on
 * focus therefore ran every query twice on open: the Library's launch log showed
 * `rows reading ms=221` then `ms=74`, the same query back to back. This skips that first call,
 * so a screen's own mount effect is the only load when it opens.
 */

import { useFocusEffect } from 'expo-router'
import { useCallback, useRef } from 'react'

export function useOnRefocus(callback: () => void): void {
  const focusedBefore = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (!focusedBefore.current) {
        focusedBefore.current = true
        return
      }
      callback()
    }, [callback]),
  )
}
