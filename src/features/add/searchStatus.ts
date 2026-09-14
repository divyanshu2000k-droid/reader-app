/**
 * src/features/add/searchStatus.ts
 *
 * WHAT THE ADD SCREEN SAYS WHILE, AND AFTER, IT ASKS TWO DATABASES. Pure, so every combination
 * of one source answering, failing, or not being asked is asserted.
 *
 * The States sheet's rules, applied (States.dc.html, 08):
 *   - **Offline is not an error.** It is a banner that reassures ("Logging still works"), never
 *     a modal. The app works offline, and Add manually still works completely (04-SCREENS, D).
 *     Books searched before are still found, from `metadata_cache`.
 *   - **A database that will not answer is a recoverable error** that says the library is fine
 *     and offers Try again.
 *   - **One source failing is not an error at all** when the other answered: the results show,
 *     with a quiet line saying which one is missing, so a thin list is explained.
 *   - **No loading state under 400 ms**, and the inline spinner always says what it is doing.
 */

import type { SearchSource } from './searchSources'

export type SourceState =
  | { readonly kind: 'notAsked' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'done' }
  | { readonly kind: 'failed'; readonly why: FailureKind }

/** `offline`: the request never reached a server. `unavailable`: a server answered badly. */
export type FailureKind = 'offline' | 'unavailable'

export const SOURCE_NAMES: Record<SearchSource, string> = {
  google: 'Google Books',
  openlibrary: 'Open Library',
}

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
  }
}

export class TimeoutError extends Error {
  constructor() {
    super('The book database took too long')
    this.name = 'TimeoutError'
  }
}

/**
 * Messages that mean the request never left the phone: no DNS, no route, no connection.
 *
 * THE PHONE, NOT A GUESS, decided these. The first version took `TypeError` to mean offline,
 * which is what React Native's old fetch threw. On the phone in airplane mode (2026-09-14) the
 * fetch Expo installs rejected with a `FetchError` whose name is "Error" and whose message is
 * `fetch failed: java.net.UnknownHostException: Unable to resolve host "openlibrary.org": No
 * address associated with hostname`. Every offline search showed "Could not reach the book
 * database" and Try again, instead of the offline banner and the books searched before.
 */
const OFFLINE_PATTERNS = [
  /UnknownHostException/i,
  /Unable to resolve host/i,
  /No address associated with hostname/i,
  /Network request failed/i,
  /network is unreachable/i,
  /ENETUNREACH|ENOTFOUND|EAI_AGAIN/,
  /Failed to connect/i,
  /SocketException/i,
  /The Internet connection appears to be offline/i,
]

/**
 * `offline`: the request never reached a server. `unavailable`: something answered badly or too
 * slowly. A bad status or a timeout means the network was there.
 */
export function failureKind(error: unknown): FailureKind {
  if (error instanceof HttpError || error instanceof TimeoutError) return 'unavailable'
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (OFFLINE_PATTERNS.some((p) => p.test(message))) return 'offline'
  // The classic React Native fetch rejects offline with a bare TypeError.
  if (error instanceof TypeError) return 'offline'
  return 'unavailable'
}

export interface SearchStatus {
  /** The inline spinner's words, or null. */
  readonly progress: string | null
  /** Show the offline banner. */
  readonly offline: boolean
  /** The recoverable error card, with Try again. */
  readonly unavailable: boolean
  /** "Open Library did not answer, so these are from Google Books only." */
  readonly partial: string | null
  /** Offline, with results from books searched before rather than from the databases. */
  readonly fromCache: boolean
}

export function searchStatus(
  google: SourceState,
  openLibrary: SourceState,
  resultCount: number,
): SearchStatus {
  const asked = (
    [
      ['google', google],
      ['openlibrary', openLibrary],
    ] as const
  ).filter(([, s]) => s.kind !== 'notAsked')

  const loading = asked.filter(([, s]) => s.kind === 'loading')
  const done = asked.filter(([, s]) => s.kind === 'done')
  const failed = asked.filter(([, s]) => s.kind === 'failed')
  const allOffline =
    failed.length > 0 &&
    failed.length === asked.length &&
    failed.every(([, s]) => s.kind === 'failed' && s.why === 'offline')

  const progress =
    loading.length === 0
      ? null
      : resultCount === 0
        ? `Searching ${loading.map(([src]) => SOURCE_NAMES[src]).join(' and ')}`
        : `Still checking ${loading.map(([src]) => SOURCE_NAMES[src]).join(' and ')}`

  const partial =
    done.length > 0 && failed.length > 0 && loading.length === 0
      ? `${failed.map(([src]) => SOURCE_NAMES[src]).join(' and ')} did not answer, so these are from ${done
          .map(([src]) => SOURCE_NAMES[src])
          .join(' and ')} only.`
      : null

  return {
    progress,
    offline: allOffline,
    unavailable: asked.length > 0 && failed.length === asked.length && !allOffline,
    partial,
    fromCache: allOffline && resultCount > 0,
  }
}
