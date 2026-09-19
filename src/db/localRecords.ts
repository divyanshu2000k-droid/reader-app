/**
 * src/db/localRecords.ts
 *
 * THE KEYS UNDER WHICH DEVICE STATE IS FILED in `metadata_cache`.
 *
 * In `db/` because more than one feature needs them, and features may not import from one
 * another (06-CONVENTIONS). `features/timer` writes a run; `features/launch` has to be able
 * to CLEAR that run when it recovers the session, without reaching into the timer.
 *
 * That is not hypothetical tidiness. Until 2026-09-18 the launch recovery sheet saved or
 * discarded a crashed timed session and left its `timer_run` row behind, so every crash
 * leaked one row that nothing would ever read or remove. Found on the emulator, by a check
 * that counted the rows after Finish and got 1 instead of 0.
 *
 * Everything filed here is LOCAL ONLY: `metadata_cache` is absent from `SYNCABLE`, so none of
 * it can reach the server, and `db/write.ts`'s `saveLocalRecord` queues nothing.
 *
 * This file holds KEYS ONLY. The sweep that removes orphaned rows lives in `write.ts`, with
 * every other write: `no-bypass.test.ts` fired the moment a `db.delete` appeared here, which
 * is the guard doing exactly its job.
 */

/** A half-written note (Slice 5b). Keyed `new:<book id>` or `edit:<note id>`. */
export const DRAFT_SOURCE = 'note_draft'

/** A timer in progress (Slice 6): its segments and last heartbeat. Keyed by session id. */
export const RUN_SOURCE = 'timer_run'

/**
 * That the reader has already been asked about notifications, and said no (Slice 6).
 *
 * One row, under `ASKED_KEY`. It exists because Android cannot be asked: tapping "Not now"
 * never reaches the system, so the permission stays `undetermined` and `canAskAgain` stays
 * true — and the priming sheet, which asks the system, therefore came back on EVERY new
 * timer. Measured on a phone on 2026-09-19: declined once, asked again on the very next
 * timer. The sheet's own comment says "Nagging is how an app earns a permanent denial".
 *
 * Deliberately in the database rather than in memory: the point is that it survives the app
 * being closed, which is when the reader would otherwise be asked again.
 */
export const PRIMING_SOURCE = 'notify_priming'
export const ASKED_KEY = 'asked'
