/**
 * src/features/library/tabRequest.ts
 *
 * A NAVIGATION THAT ASKS FOR A TAB IS HONOURED EVERY TIME, NOT ONLY THE FIRST TIME.
 *
 * "Start the next one" on the finish screen opens the Library on Want to read by passing
 * `tab`. The request used to be the parameter alone, so a second "Start the next one" after
 * the reader had tapped another chip carried the identical `tab`, compared equal to the one
 * already honoured, and changed nothing: the reader asked for Want to read and stayed on
 * Finished.
 *
 * `at` is a timestamp stamped by the caller, so each navigation is its own request. The two
 * guarantees run in opposite directions and both matter:
 *
 *   - a NEW request switches the tab, even when it names the tab a previous one named;
 *   - a re-render with no new request leaves the reader on the chip they tapped.
 */

export interface TabParams {
  readonly tab?: string | undefined
  readonly at?: string | undefined
}

export interface TabRequest<S extends string> {
  /** The identity of this navigation. Hold it, and compare the next one against it. */
  readonly key: string
  /** The tab to switch to, or null to leave the reader where they are. */
  readonly tab: S | null
}

/**
 * @param seenKey the `key` of the last request already honoured.
 * @param tabs the tab names that exist; anything else in the URL is ignored rather than
 *   trusted, because a deep link is outside input.
 */
export function readTabRequest<S extends string>(
  params: TabParams,
  seenKey: string,
  tabs: readonly S[],
): TabRequest<S> {
  const key = `${params.tab ?? ''}@${params.at ?? ''}`
  if (key === seenKey) return { key, tab: null }
  const { tab } = params
  const known = tab !== undefined && (tabs as readonly string[]).includes(tab)
  return { key, tab: known ? (tab as S) : null }
}
