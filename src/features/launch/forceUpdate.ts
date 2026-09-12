/**
 * src/features/launch/forceUpdate.ts
 *
 * THE KILL SWITCH's IO half. Gate 1 of Journey A.
 *
 * A single static JSON file, fetched on every launch with a 2 second timeout. See
 * DECISIONS.md, 2026-09-10, for where it is hosted and why. The decision this fetch feeds
 * lives in `forceUpdatePolicy.ts`, which is pure and tested; this file only reaches the
 * network and hands the body over.
 *
 * Never throws, never rejects, and resolves within roughly the timeout in the worst case.
 * Every failure — offline, DNS, TLS, timeout, 500, an HTML error page a CDN served
 * instead of JSON — proceeds to the library. Failing open costs a kill switch one extra
 * launch to bite. Failing closed bricks readers who did nothing wrong.
 *
 * THE VERDICT IS NEVER PERSISTED, and that is an invariant rather than an oversight.
 * Caching the last-known flag so the gate can answer instantly offline looks obviously
 * right and is a trap: one mistaken flip then bricks the app permanently for every reader
 * who goes offline, and there is no way to reach them to undo it. A block must require a
 * fresh, successful response on THIS launch. That single rule is what makes every mistake
 * here recoverable by editing one file.
 */

import { decide, proceed, type ForceUpdateResult } from './forceUpdatePolicy'
import { androidPackage, appVersion, config } from '@/lib/config'
import { now } from '@/lib/dates'

/** The 2 second budget from Journey A. Never block launch on a network call. */
export const FORCE_UPDATE_TIMEOUT_MS = 2000

/**
 * Where the update button sends the reader.
 *
 * Derived from the app's own package id at build time, never taken from the payload. A
 * remote file that could choose the destination of the only button on a screen with no
 * dismiss is a phishing page the reader cannot leave — and since the store link is
 * knowable locally, trusting the network for it buys nothing at all.
 */
export function storeUrl(): string | null {
  return androidPackage
    ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(androidPackage)}`
    : null
}

export async function checkForceUpdate(): Promise<ForceUpdateResult> {
  const url = config.forceUpdateUrl
  if (!url) return proceed('no force-update URL configured')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FORCE_UPDATE_TIMEOUT_MS)

  try {
    /**
     * CACHE-BUSTED, deliberately.
     *
     * The host is configured to revalidate on every request, but the request never
     * reaches it if Android's own HTTP cache, a carrier proxy or a corporate middlebox
     * answers first. A stale flag fails silently in BOTH directions: the flip you make to
     * retire a build is not seen, and the flip you make to un-brick people is not seen
     * either. The second one is the frightening one.
     *
     * A unique URL per launch costs one query parameter and makes the whole class of
     * stale-cache failure impossible. The usual objection — that it defeats the CDN and
     * hammers the origin — does not apply here: the chosen host serves static assets with
     * unlimited free requests, and this is one small file fetched once per cold start.
     */
    const bustedUrl = `${url}${url.includes('?') ? '&' : '?'}t=${now()}`

    const response = await fetch(bustedUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    })
    if (!response.ok) return proceed(`flag responded ${response.status}`)

    // Throws on the HTML error page a CDN will happily serve in place of JSON, which is
    // caught below like everything else.
    const body: unknown = await response.json()
    return decide(appVersion, body)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    return proceed(`flag unreachable: ${reason}`)
  } finally {
    // In `finally`, not after the await: a fast successful fetch would otherwise leave a
    // live 2 second timer holding the AbortController.
    clearTimeout(timer)
  }
}
