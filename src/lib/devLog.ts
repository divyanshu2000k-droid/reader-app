/**
 * src/lib/devLog.ts
 *
 * Dev-only diagnostics that reach logcat WITHOUT raising LogBox's toast.
 *
 * In a development build every `console.warn` raises LogBox's "Open debugger to view
 * warnings" toast, and on Android that toast sits above Modals and over the tab bar and
 * swallows every touch beneath it. A button that "does nothing" may never have been
 * touched. That cost an evening in Slice 1 (DECISIONS.md, 2026-09-10), and a measurement
 * that breaks the screen it is measuring is worse than no measurement.
 *
 * So: one prefix, ignored by LogBox, for numbers worth printing while developing. Never
 * for anything that is actually wrong — warn properly for that, and let the toast appear.
 */

import { LogBox } from 'react-native'

const PREFIX = '[dev]'

if (__DEV__) LogBox.ignoreLogs([/^\[dev\]/])

export function devLog(message: string, detail?: Record<string, string | number>): void {
  if (!__DEV__) return
  const parts = detail
    ? Object.entries(detail)
        .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`)
        .join(' ')
    : ''
  console.warn(`${PREFIX} ${message} ${parts}`.trim())
}

/** Times an async operation and logs how long it took. Returns whatever it returned. */
export async function devTimed<T>(label: string, run: () => Promise<T>): Promise<T> {
  if (!__DEV__) return run()
  const started = Date.now()
  const value = await run()
  devLog(label, { ms: Date.now() - started })
  return value
}
