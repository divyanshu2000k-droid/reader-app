/**
 * src/features/library/tabData.ts
 *
 * WHAT A TAB MAY SHOW WHILE ITS OWN QUERY IS STILL RUNNING: nothing from another tab.
 *
 * The hook used to keep `rows` from the previous tab until the new query returned, so tapping
 * Finished drew the Reading list under the Finished chip for up to 251 ms, and could say "No
 * books yet" for a tab it had not asked about. Every result is now stored with the tab it
 * belongs to, and a result for any other tab reads as "not loaded". Loading shows nothing for
 * the first 400 ms (SkeletonGate), which is honest; the wrong books are not.
 */

export interface TabResult<S, R> {
  readonly status: S
  readonly rows: readonly R[]
  /** True when the whole library has no live book, not just this tab. */
  readonly libraryEmpty: boolean
}

export interface TabView<R> {
  /** Null until THIS tab's query has answered. */
  readonly rows: readonly R[] | null
  readonly libraryEmpty: boolean | null
}

export function viewForTab<S, R>(result: TabResult<S, R> | null, status: S): TabView<R> {
  if (result === null || result.status !== status) return { rows: null, libraryEmpty: null }
  return { rows: result.rows, libraryEmpty: result.libraryEmpty }
}
