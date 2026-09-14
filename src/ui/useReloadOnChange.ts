/**
 * src/ui/useReloadOnChange.ts
 *
 * Re-reads a screen's data when the library changes: at once if the screen is focused, else
 * the next time it is (ui/stalePolicy.ts). Replaces `useOnRefocus` for screens that show the
 * reader's books and sessions, because a write can come from somewhere that is not another
 * screen: an Undo toast on this one.
 */

import { useFocusEffect, useIsFocused } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'

import { onDataChanged, onFocused } from './stalePolicy'
import { subscribeDataChanges } from '@/db/changes'

export function useReloadOnChange(reload: () => void): void {
  const focused = useIsFocused()
  const focusedRef = useRef(focused)
  const stale = useRef(false)

  useEffect(() => {
    focusedRef.current = focused
  }, [focused])

  useEffect(
    () =>
      subscribeDataChanges(() => {
        if (onDataChanged(focusedRef.current) === 'reload') reload()
        else stale.current = true
      }),
    [reload],
  )

  useFocusEffect(
    useCallback(() => {
      if (!onFocused(stale.current)) return
      stale.current = false
      reload()
    }, [reload]),
  )
}
