/**
 * src/features/launch/useLaunchGates.ts
 *
 * JOURNEY A, THE COLD START. Four gates, strictly in order, each either passing straight
 * through invisibly or taking over the whole screen. Nothing else may appear before the
 * Library.
 *
 *   1. Force update   — remote flag, 2s timeout, fail open
 *   2. Session recovery — an unfinished timed session, never silently discarded
 *   3. Restore        — signed in with an empty database (Slice 8; see below)
 *   4. Library
 *
 * Plus one that is not in the journey because it sits underneath all of them: the
 * database has to open and migrate before gates 2 and 3 can ask it anything. A migration
 * that fails takes over the screen too, with a retry.
 *
 * ─── WHY THE ORDER AND THE CONCURRENCY ARE DIFFERENT THINGS ───────────────────
 *
 * The gates are EVALUATED in order. The work behind them STARTS at the same time.
 *
 * Non-negotiable rule 1 says the UI never waits on the network, and Journey A allows the
 * force-update check 2 seconds. Run them in sequence and every cold start on a bad
 * network pays up to 2 seconds of splash for a flag that is false essentially always.
 * Run them concurrently and that cost is hidden behind the migration and the first
 * queries, which have to happen anyway.
 *
 * The ordering that matters is which screen WINS when more than one gate has an opinion,
 * and that is preserved exactly. See DECISIONS.md, 2026-09-10.
 *
 * ─── WHY THE BLOCKING FLAG IS NEVER CACHED ────────────────────────────────────
 *
 * Persisting the last-known flag so the gate can answer instantly offline looks obviously
 * right and is a trap: one mistaken flip then bricks the app permanently for every reader
 * who goes offline, and there is no way to reach them to undo it. The check is made fresh
 * every launch and fails open every time.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { checkForceUpdate } from './forceUpdate'
import type { UpdateRequirement } from './forceUpdatePolicy'
import { getOpenSession, type OpenSession } from './queries'
import { useMigrationStatus, type MigrationState } from '@/db/migrate'

export type LaunchGate =
  /** Nothing has been decided yet. The splash is still up. */
  | { readonly gate: 'booting' }
  /** Gate 1. No dismiss, by design. */
  | { readonly gate: 'update'; readonly requirement: UpdateRequirement }
  /** Underneath every gate: the database could not be opened or migrated. */
  | { readonly gate: 'migrationFailed'; readonly message: string }
  /** Gate 2. */
  | { readonly gate: 'recoverSession'; readonly session: OpenSession }
  /** Gate 4. Show the app. */
  | { readonly gate: 'ready' }

export interface LaunchState {
  readonly state: LaunchGate
  readonly migration: MigrationState
  /** Called by the recovery sheet once the reader has answered it. */
  readonly resolveSession: () => void
}

export function useLaunchGates(): LaunchState {
  const migration = useMigrationStatus()

  // `undefined` means "still checking"; null means "checked, not blocked". The three
  // states have to be distinguishable or the gate cannot tell "no opinion yet" from
  // "no opinion".
  const [requirement, setRequirement] = useState<UpdateRequirement | null | undefined>(
    undefined,
  )
  const [openSession, setOpenSession] = useState<OpenSession | null | undefined>(undefined)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /**
   * Gate 1, started immediately and independently of the database.
   *
   * `checkForceUpdate` never rejects, so there is no catch here and no path where this
   * effect leaves `requirement` undefined forever. If that ever changes, the splash would
   * hang — which is why that guarantee is asserted in the policy's tests rather than
   * assumed here.
   */
  useEffect(() => {
    void checkForceUpdate().then((result) => {
      if (!alive.current) return
      setRequirement(result.blocked ? result.requirement : null)
      // Dev only, and a warn rather than a log: this is the one line that explains, on a
      // device, why a flag you just flipped did or did not bite.
      if (__DEV__ && !result.blocked) {
        console.warn(`[launch] force update: proceeding — ${result.reason}`)
      }
    })
  }, [])

  /**
   * Gate 2, which cannot start until the database is migrated: querying a database that
   * is mid-migration is how you read half a schema.
   */
  useEffect(() => {
    if (migration.status.state !== 'done') return
    let cancelled = false
    void getOpenSession()
      .then((session) => {
        if (!cancelled && alive.current) setOpenSession(session)
      })
      .catch((cause: unknown) => {
        // A failed query here must not hold the launch. The reader loses the chance to
        // recover one session; blocking the app on it would lose them everything.
        console.warn('[launch] could not check for an open session:', cause)
        if (!cancelled && alive.current) setOpenSession(null)
      })
    return () => {
      cancelled = true
    }
  }, [migration.status.state])

  /** The reader answered the recovery sheet. Nothing left to recover. */
  const resolveSession = useCallback(() => setOpenSession(null), [])

  return { state: evaluate(requirement, migration, openSession), migration, resolveSession }
}

/**
 * The gate order, in one readable place.
 *
 * Deliberately a pure function of the three inputs rather than a chain of early returns
 * spread through the hook: the order IS the specification, and it should be possible to
 * check it against Journey A by reading twelve lines.
 */
function evaluate(
  requirement: UpdateRequirement | null | undefined,
  migration: MigrationState,
  openSession: OpenSession | null | undefined,
): LaunchGate {
  // 1 · Force update. Still checking means still booting: a retired build must not get a
  // glimpse of the library first.
  if (requirement === undefined) return { gate: 'booting' }
  if (requirement) return { gate: 'update', requirement }

  // 0 · The database, underneath everything. A failure here takes over the screen.
  if (migration.status.state === 'pending') return { gate: 'booting' }
  if (migration.status.state === 'failed') {
    return { gate: 'migrationFailed', message: migration.status.error }
  }

  // 2 · A session was still running.
  if (openSession === undefined) return { gate: 'booting' }
  if (openSession) return { gate: 'recoverSession', session: openSession }

  // 3 · Restore. Deliberately not implemented: it triggers on "signed in AND the local
  // database is empty", and there is no sign-in until Slice 8, so the condition cannot be
  // true. The slot is here, in order, so that Slice 8 adds a branch rather than
  // retrofitting a sequencer — `isLibraryEmpty()` in queries.ts is the half that can be
  // written without auth and is already there. Building the screen now would mean
  // inventing a book count to display. See DECISIONS.md, 2026-09-10.

  // 4 · Library.
  return { gate: 'ready' }
}
