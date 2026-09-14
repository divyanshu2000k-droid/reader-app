/**
 * src/features/add/api.ts
 *
 * The two HTTP calls, and nothing else. What comes back is parsed in `searchSources.ts` and
 * classified in `searchStatus.ts`, both pure and tested; this file is the part only a phone
 * with and without a network can verify.
 *
 * - **A timeout on every request.** A search that hangs on a bad connection is a spinner over
 *   nothing, forever.
 * - **Open Library gets its User-Agent** (ADR 005).
 * - **Google Books is not asked without a key.** Unkeyed requests were refused outright
 *   (429, quota 0, 2026-09-14), and a request certain to fail on every keystroke is a
 *   "Google Books did not answer" line on every search.
 */

import { HttpError, TimeoutError } from './searchStatus'
import {
  OPEN_LIBRARY_USER_AGENT,
  googleBooksUrl,
  openLibraryUrl,
  parseGoogleBooks,
  parseOpenLibrary,
  type SearchHit,
} from './searchSources'
import { config } from '@/lib/config'
import { isFaultArmed } from '@/lib/faults'

export const SEARCH_TIMEOUT_MS = 10_000

export const googleBooksEnabled: boolean = config.googleBooksApiKey !== null

async function getJson(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  if (isFaultArmed('bookSearch')) throw new HttpError(503)
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, SEARCH_TIMEOUT_MS)
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) throw new HttpError(response.status)
    return (await response.json()) as unknown
  } catch (error) {
    if (timedOut) throw new TimeoutError()
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}

export async function searchGoogleBooks(
  term: string,
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  const key = config.googleBooksApiKey
  if (key === null) return []
  return parseGoogleBooks(await getJson(googleBooksUrl(term, key), {}, signal))
}

export async function searchOpenLibrary(
  term: string,
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  return parseOpenLibrary(
    await getJson(openLibraryUrl(term), { 'User-Agent': OPEN_LIBRARY_USER_AGENT }, signal),
  )
}
