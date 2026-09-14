/**
 * src/ui/stalePolicy.ts
 *
 * WHEN A SCREEN RE-READS ITS DATA. Pure, so the rule is tested.
 *
 * - A write while the screen is focused: reload now. That is the Undo toast on the screen
 *   the reader is looking at (db/changes.ts).
 * - A write while it is not focused, say book detail under the logger: remember that it is
 *   stale, and reload when it is focused again. Reloading screens nobody is looking at on
 *   every write would re-run a 2000-book Library query for each batch of a seed.
 * - Regaining focus with nothing written since: do nothing. The old rule reloaded on every
 *   return, so returning after a save queried once for the return and could query again for
 *   the write.
 */

export function onDataChanged(focused: boolean): 'reload' | 'markStale' {
  return focused ? 'reload' : 'markStale'
}

export function onFocused(stale: boolean): boolean {
  return stale
}
