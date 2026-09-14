/**
 * src/features/add/hooks/useBookSearch.ts
 *
 * Searching the two book databases, as the Add screen needs it.
 *
 * - **TanStack Query, for these two APIs only** (06-CONVENTIONS, State): each source is its own
 *   query, so a slow one never holds back a fast one, and results render as they arrive.
 * - **`networkMode: 'always'`.** The default pauses a query while TanStack believes the phone is
 *   offline, and nothing here tells it about connectivity, so "offline" would have shown as a
 *   spinner forever. Always running means an offline request fails fast, and the screen can say
 *   so and fall back to what was searched before.
 * - **Debounced by `rules.searchDebounceMs`**, and not asked below two characters.
 * - **Every result is remembered** (`metadata_cache`), so offline search still finds books the
 *   reader has searched for before.
 */

import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { googleBooksEnabled, searchGoogleBooks, searchOpenLibrary } from '../api'
import { rememberResults, searchRemembered } from '../queries'
import { mergeResults, type SearchResult } from '../searchMerge'
import { failureKind, searchStatus, type SearchStatus, type SourceState } from '../searchStatus'
import type { SearchHit } from '../searchSources'
import { rules } from '@/ui/theme'

export const MIN_TERM_LENGTH = 2

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function sourceState(
  enabled: boolean,
  query: { isFetching: boolean; isError: boolean; isSuccess: boolean; error: unknown },
): SourceState {
  if (!enabled) return { kind: 'notAsked' }
  if (query.isFetching) return { kind: 'loading' }
  if (query.isError) return { kind: 'failed', why: failureKind(query.error) }
  if (query.isSuccess) return { kind: 'done' }
  return { kind: 'loading' }
}

export interface BookSearch {
  /** The term the results are for, after the debounce. */
  readonly term: string
  readonly results: SearchResult[]
  readonly status: SearchStatus
  readonly retry: () => void
}

const QUERY_OPTIONS = {
  networkMode: 'always',
  retry: 0,
  staleTime: Infinity,
  gcTime: 30 * 60 * 1000,
} as const

export function useBookSearch(typed: string): BookSearch {
  const term = useDebounced(typed.trim(), rules.searchDebounceMs)
  const asking = term.length >= MIN_TERM_LENGTH

  const google = useQuery<SearchHit[]>({
    queryKey: ['bookSearch', 'google', term],
    queryFn: ({ signal }) => searchGoogleBooks(term, signal),
    enabled: asking && googleBooksEnabled,
    ...QUERY_OPTIONS,
  })
  const openLibrary = useQuery<SearchHit[]>({
    queryKey: ['bookSearch', 'openlibrary', term],
    queryFn: ({ signal }) => searchOpenLibrary(term, signal),
    enabled: asking,
    ...QUERY_OPTIONS,
  })

  const googleState = sourceState(asking && googleBooksEnabled, google)
  const openLibraryState = sourceState(asking, openLibrary)

  const live = useMemo(
    () => (asking ? mergeResults(term, google.data ?? null, openLibrary.data ?? null) : []),
    [asking, term, google.data, openLibrary.data],
  )

  // Remember what the databases returned, once per answer.
  useEffect(() => {
    if (live.length > 0 && !google.isFetching && !openLibrary.isFetching)
      void rememberResults(live)
  }, [live, google.isFetching, openLibrary.isFetching])

  // Offline: what was searched before.
  const liveStatus = searchStatus(googleState, openLibraryState, live.length)
  const [remembered, setRemembered] = useState<{
    term: string
    results: SearchResult[]
  } | null>(null)
  useEffect(() => {
    if (!liveStatus.offline || !asking) return
    let cancelled = false
    void searchRemembered(term)
      .then((results) => !cancelled && setRemembered({ term, results }))
      .catch(() => !cancelled && setRemembered({ term, results: [] }))
    return () => {
      cancelled = true
    }
  }, [liveStatus.offline, asking, term])

  const offlineResults =
    liveStatus.offline && remembered?.term === term ? remembered.results : null
  const results = offlineResults ?? live

  return {
    term,
    results,
    status: searchStatus(googleState, openLibraryState, results.length),
    retry: () => {
      if (googleBooksEnabled) void google.refetch()
      void openLibrary.refetch()
    },
  }
}
