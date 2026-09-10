/**
 * DEV ONLY. The device pass, reachable from Settings and from `EXPO_PUBLIC_DEVICE_PASS=1`.
 *
 * Moved here from the Slice 0 placeholder route, which Slice 1 deletes. The module is
 * reached through `require()` inside a `__DEV__` branch rather than a top-level import:
 * Metro replaces `__DEV__` with `false` in a production bundle and drops the branch, so
 * `devchecks` is never bundled. Relative path, not the `@/` alias — Metro does not resolve
 * aliases inside `require()`, and an aliased require typechecks and fails at runtime.
 */

import { useEffect } from 'react'

export async function runDevicePass(): Promise<string> {
  if (!__DEV__) return 'unavailable'
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./devchecks') as typeof import('./devchecks')
  const s = mod.summarise(await mod.runDeviceChecks())
  return `RUNTIME ${s.runtimePassed}/${s.runtimeTotal} · COMPILE-TIME ${s.compilePassed}/${s.compileTotal}`
}

/**
 * Runs the pass once, after the launch gates have passed, when Metro was started with
 * `EXPO_PUBLIC_DEVICE_PASS=1`. `enabled` is the gates' "ready" signal: running checks
 * against a database that is still migrating would test half a schema.
 */
export function useDevicePassAutorun(enabled: boolean): void {
  useEffect(() => {
    if (!__DEV__ || !enabled || process.env.EXPO_PUBLIC_DEVICE_PASS !== '1') return
    const t = setTimeout(() => {
      runDevicePass().catch((e: unknown) => console.warn('[devcheck] crashed:', e))
    }, 0)
    return () => clearTimeout(t)
  }, [enabled])
}
