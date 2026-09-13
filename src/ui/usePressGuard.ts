/**
 * src/ui/usePressGuard.ts
 *
 * Wraps a press handler so a second press inside `rules.pressDebounceMs` is ignored. The rule is
 * `acceptPress` in pressGuard.ts; this is only its memory.
 */

import { useCallback, useRef } from 'react'

import { acceptPress } from './pressGuard'
import { rules } from './theme'
import { now } from '@/lib/dates'

export function usePressGuard<A extends unknown[]>(
  handler: (...args: A) => void,
): (...args: A) => void {
  const lastAcceptedAt = useRef<number | null>(null)
  return useCallback(
    (...args: A) => {
      const at = now()
      if (!acceptPress(lastAcceptedAt.current, at, rules.pressDebounceMs)) return
      lastAcceptedAt.current = at
      handler(...args)
    },
    [handler],
  )
}
