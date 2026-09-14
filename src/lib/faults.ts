/**
 * src/lib/faults.ts
 *
 * FORCED FAILURES, for seeing every failure render on a phone. Development builds only.
 *
 * No failure render had ever been seen on a device. A local SQLite read almost never fails,
 * so the Library's error, book detail's error, an action failing inside the actions sheet and
 * a session that will not save existed only as code that typechecked (DECISIONS.md,
 * 2026-09-13, "Device checks deferred from Slice 2"). Each named fault below makes one of
 * those paths fail on purpose, from the dev block in Settings.
 *
 * ─── WHY A RELEASE BUILD CAN NEVER ARM ONE ────────────────────────────────────
 *
 * `armFault` takes the build flag as an argument and refuses unless it is true, and its one
 * caller passes `__DEV__` literally, which Metro replaces with `false` in a release bundle.
 * A test holds the literal, with a control. This module does not read `__DEV__` itself so
 * that node can load it and test the rule.
 *
 * Faults live in memory and clear on reload. Nothing about them is persisted, so a
 * forgotten armed fault cannot survive into the next launch.
 */

export type FaultName =
  'libraryQuery' | 'bookDetail' | 'bookAction' | 'sessionSave' | 'bookSearch' | 'bookSave'

export const FAULTS: readonly { readonly name: FaultName; readonly label: string }[] = [
  { name: 'libraryQuery', label: 'Library list fails to load' },
  { name: 'bookDetail', label: 'Book detail fails to load' },
  { name: 'bookAction', label: 'Actions sheet action fails' },
  { name: 'sessionSave', label: 'Saving a session fails' },
  { name: 'bookSearch', label: 'Book search gets a server error' },
  { name: 'bookSave', label: 'Adding or editing a book fails' },
]

const armed = new Set<FaultName>()

/** Arms or disarms one fault. Refused outright unless this is a development build. */
export function setFault(isDevelopmentBuild: boolean, name: FaultName, on: boolean): boolean {
  if (!isDevelopmentBuild) return false
  if (on) armed.add(name)
  else armed.delete(name)
  return true
}

export function isFaultArmed(name: FaultName): boolean {
  return armed.has(name)
}

/** The error an armed fault produces. Says it is injected, so nobody chases it as real. */
export function injectedError(name: FaultName): Error {
  return new Error(`Injected failure (dev): ${name}`)
}

/** For read paths: throws when armed, exactly as a failed query would. */
export function throwIfFault(name: FaultName): void {
  if (armed.has(name)) throw injectedError(name)
}

/** Test support: disarm everything. */
export function clearFaults(): void {
  armed.clear()
}
