/**
 * src/features/launch/gateOrder.ts
 *
 * JOURNEY A's GATE ORDER, as a pure function. The specification written as code.
 *
 * Separate from `useLaunchGates.ts` so that it can be tested under `node --test`: the hook
 * pulls in expo-sqlite, expo-constants and React, none of which load outside a phone. Every
 * import here is type-only and erased, which is what makes this file testable at all.
 *
 *   1. Force update     — a retired build must not glimpse the library
 *   0. The database     — underneath every gate; a failure takes over the screen
 *   2. Session recovery — an unfinished timed session, never silently discarded
 *   3. Restore          — Slice 8 (sign-in); the condition cannot yet be true
 *   4. Library
 *
 * The work behind the gates starts concurrently. This function only decides which screen
 * WINS when more than one gate has an opinion. See DECISIONS.md, 2026-09-10.
 */

import type { UpdateRequirement } from './forceUpdatePolicy'
import type { OpenSession } from './queries'
import type { MigrationFailure, MigrationStatus } from '@/db/migrate'

export type LaunchGate =
  /** Nothing has been decided yet. The splash is still up. */
  | { readonly gate: 'booting' }
  /** Gate 1. No dismiss, by design. */
  | { readonly gate: 'update'; readonly requirement: UpdateRequirement }
  /** Underneath every gate: the database could not be opened or migrated. */
  | { readonly gate: 'migrationFailed'; readonly error: MigrationFailure }
  /** Gate 2. */
  | { readonly gate: 'recoverSession'; readonly session: OpenSession }
  /** Gate 4. Show the app. */
  | { readonly gate: 'ready' }

/**
 * @param requirement `undefined` still checking, `null` checked and not blocked.
 * @param migration the migration's current status. A retry in progress keeps the FAILED
 *   status until it resolves, so the notice — with its busy Try again — stays on screen
 *   rather than dropping to 'booting', which renders nothing once the splash is gone.
 * @param openSession `undefined` not yet asked, `null` none.
 */
export function evaluate(
  requirement: UpdateRequirement | null | undefined,
  migration: MigrationStatus,
  openSession: OpenSession | null | undefined,
): LaunchGate {
  // 1 · Force update. Still checking means still booting.
  if (requirement === undefined) return { gate: 'booting' }
  if (requirement) return { gate: 'update', requirement }

  // 0 · The database.
  if (migration.state === 'pending') return { gate: 'booting' }
  if (migration.state === 'failed') return { gate: 'migrationFailed', error: migration.error }

  // 2 · A session was still running.
  if (openSession === undefined) return { gate: 'booting' }
  if (openSession) return { gate: 'recoverSession', session: openSession }

  // 3 · Restore. Deliberately not implemented: it triggers on "signed in AND the local
  // database is empty", and there is no sign-in until Slice 8, so the condition cannot be
  // true. The slot is here, in order, so that Slice 8 adds a branch rather than
  // retrofitting a sequencer; `isLibraryEmpty()` in queries.ts is the half that can be
  // written without auth and is already there. Building the screen now would mean
  // inventing a book count to display. See DECISIONS.md, 2026-09-10.

  // 4 · Library.
  return { gate: 'ready' }
}
