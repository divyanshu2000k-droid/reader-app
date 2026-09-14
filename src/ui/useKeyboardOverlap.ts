/**
 * src/ui/useKeyboardOverlap.ts
 *
 * How many pixels of a full-screen form the keyboard covers, re-measured whenever the
 * keyboard moves or the form's layout changes. The rule is `keyboardOverlap.ts`; this is its
 * measurement. Attach `ref` and `onLayout` to the screen's outermost View and pad its bottom
 * by `overlap`.
 *
 * NOT used by `Sheet`, which has its own handling proven on the phone for a Modal. A full
 * screen and a Modal window are different cases, and this one is verified separately.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Keyboard, type View } from 'react-native'

import { keyboardOverlap } from './keyboardOverlap'

export function useKeyboardOverlap() {
  const ref = useRef<View>(null)
  const keyboardTop = useRef<number | null>(null)
  const [overlap, setOverlap] = useState(0)

  const measure = useCallback(() => {
    const view = ref.current
    if (!view) return
    view.measureInWindow((_x, y, _w, h) => {
      setOverlap(keyboardOverlap(y + h, keyboardTop.current))
    })
  }, [])

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY
      measure()
    })
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null
      setOverlap(0)
    })
    return () => {
      shown.remove()
      hidden.remove()
    }
  }, [measure])

  return { ref, onLayout: measure, overlap }
}
