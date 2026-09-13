/**
 * src/ui/coverSource.ts
 *
 * WHICH IMAGE A COVER SHOULD TRY NEXT. Pure, so the fallback chain is asserted under node.
 *
 * The bug this replaces: `BookCover` rendered whichever source it had and never looked back.
 * A downloaded cover whose file was cleared, or a remote URL while offline — the NORMAL case
 * for a local-first app — left a blank coloured box with no initial on it. Now each source
 * that fails is skipped, and when none is left the cover falls back to its initial.
 *
 * Order: the local copy first (covers must survive offline), then the remote URL.
 */

/** A bare Android path is not a URI React Native's Image can load. */
function asUri(path: string): string {
  return path.startsWith('/') ? `file://${path}` : path
}

export function coverCandidates(localPath: string | null, url: string | null): string[] {
  return [localPath, url]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map(asUri)
}

/** The first candidate that has not failed, or null: draw the initial. */
export function nextCoverSource(
  candidates: readonly string[],
  failed: ReadonlySet<string>,
): string | null {
  return candidates.find((c) => !failed.has(c)) ?? null
}
