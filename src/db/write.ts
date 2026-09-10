/**
 * src/db/write.ts
 *
 * THE ONLY WRITE PATH IN THE APP.
 *
 * Every write to a syncable table goes through here, and the table write plus the
 * `sync_queue` append happen in one transaction. Both or neither.
 *
 * `queries.ts` files call these functions and never call `getDb().insert`, `.update` or
 * `.delete` directly, and never touch the raw expo-sqlite handle, which `client.ts` does
 * not export for exactly that reason. A test in `__tests__/no-bypass.test.ts` greps the
 * source and fails if anything does, because "remember to enqueue" is not a strategy
 * that survives twelve slices.
 *
 * The drain is a no-op until Slice 8. That is deliberate: retrofitting the enqueue into
 * a dozen working query functions in week fourteen means the ones you miss are
 * discovered as a reader's missing data. See DECISIONS.md, 2026-09-03.
 */

import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import type { AnySQLiteColumn, SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'

import { getDb, runInTransaction, type Database } from './client'
import {
  bookShelves,
  books,
  goals,
  notes,
  reads,
  sessions,
  shelves,
  syncQueue,
  type SyncOperation,
} from './schema'
import { now, type UnixMs } from '@/lib/dates'
import { appError, attempt, type Result } from '@/lib/result'

/**
 * The registry of syncable tables, keyed by SQL table name.
 *
 * `sync_queue` and `metadata_cache` are deliberately absent: both are local-only and
 * must never enqueue. Their absence here is what makes writing to them through this
 * module a compile error rather than a convention.
 *
 * Passing the table by name rather than by object is what removes a whole error class:
 * the queue's `table_name` and the row's `id` are derived from the same call, so they
 * cannot disagree.
 */
const SYNCABLE = {
  books,
  reads,
  sessions,
  shelves,
  book_shelves: bookShelves,
  notes,
  goals,
} as const

export type SyncableTable = keyof typeof SYNCABLE

/**
 * What a caller supplies for one syncable table, e.g. `RowFor<'sessions'>`.
 *
 * `createdAt`, `updatedAt` and `deletedAt` are deliberately NOT part of it:
 *   - `createdAt` and `updatedAt` are stamped here, so a caller cannot get them wrong
 *     and an update cannot rewrite a creation date.
 *   - `deletedAt` is owned by `softDelete` and `restoreRow`. A delete performed by
 *     passing `deletedAt` to `writeRow` would enqueue an `upsert` rather than a
 *     `delete`, and would skip the cascade below.
 */
export type RowFor<K extends SyncableTable> = Omit<
  (typeof SYNCABLE)[K]['$inferInsert'],
  'createdAt' | 'updatedAt' | 'deletedAt'
> & { id: string }

export const SYNCABLE_TABLES = Object.keys(SYNCABLE) as SyncableTable[]

export function isSyncable(name: string): name is SyncableTable {
  return name in SYNCABLE
}

/**
 * The shape every syncable table is required to have.
 *
 * Enforcing it here is what would have caught `book_shelves` shipping with a composite
 * key and no `deleted_at`: that table was listed as syncable but had neither an `id` nor
 * the sync columns, so `softDelete` on it would have failed at runtime on the first
 * shelf removal in Slice 2.
 */
interface SyncableShape extends SQLiteTable {
  id: SQLiteColumn
  createdAt: SQLiteColumn
  updatedAt: SQLiteColumn
  deletedAt: SQLiteColumn
}

/** Compile-time proof that every registered table satisfies the shape above. */
const _shapeCheck: Record<SyncableTable, SyncableShape> = SYNCABLE
void _shapeCheck

/**
 * The single cast in the module, and the reason it is here.
 *
 * Drizzle's builder types do not survive indexing into a heterogeneous registry: the
 * value type becomes a union of nine table types and `.values()` / `.set()` resolve to
 * an intersection that nothing satisfies. This is a known limitation of the query
 * builder's generics, not a modelling problem.
 *
 * It is contained to this one helper, and the guarantee it erases is restored by
 * `_shapeCheck` above, which fails to compile if any registered table lacks `id`,
 * `createdAt`, `updatedAt` or `deletedAt`. The public API of this module is fully typed.
 */
function tableFor(name: SyncableTable): SyncableShape {
  return SYNCABLE[name] as unknown as SyncableShape
}

// ─── THE SOFT-DELETE CASCADE ─────────────────────────────────────────────────

/**
 * WHAT A DELETE TAKES WITH IT.
 *
 * Soft-deleting a book soft-deletes its reads, its sessions, its notes and its shelf
 * assignments, in the same transaction, each with its own queue row. Restoring the book
 * reverses exactly that set.
 *
 * The alternative — a book whose `deleted_at` is set while its sessions stay live — was
 * the shape this file shipped with, and it means every statistic keeps counting a book
 * the reader deleted. Wrong numbers that nobody can explain are precisely what this
 * product exists not to produce, and "remember to filter deleted parents" in twelve
 * separate `queries.ts` files is the same losing strategy as "remember to enqueue".
 *
 * HOW RESTORE KNOWS WHAT TO UNDO. Every row in one cascade is stamped with the same
 * `deleted_at`, and restore only clears children whose `deleted_at` equals the parent's.
 * A session the reader deleted on its own last week has a different timestamp and stays
 * deleted, which is the behaviour they would expect: undoing "remove this book" should
 * not silently resurrect something else they meant to throw away.
 *
 * The cost is that deleting a book with 500 sessions writes 500 queue rows. That is
 * correct — every one of those rows genuinely has to reach the server — and it is one
 * transaction, so the reader sees one atomic undoable action.
 */
interface ChildLink {
  readonly table: SyncableTable
  /**
   * Ids of child rows pointing at `parentId`, narrowed by a predicate on the child's
   * own `deleted_at`. Closes over the concrete table so nothing here needs a cast.
   */
  readonly ids: (
    db: Database,
    parentId: string,
    when: (deletedAt: AnySQLiteColumn) => SQL,
  ) => string[]
}

const CHILDREN: Partial<Record<SyncableTable, readonly ChildLink[]>> = {
  books: [
    {
      table: 'reads',
      ids: (db, parentId, when) =>
        db
          .select({ id: reads.id })
          .from(reads)
          .where(and(eq(reads.bookId, parentId), when(reads.deletedAt)))
          .all()
          .map((r) => r.id),
    },
    {
      table: 'notes',
      ids: (db, parentId, when) =>
        db
          .select({ id: notes.id })
          .from(notes)
          .where(and(eq(notes.bookId, parentId), when(notes.deletedAt)))
          .all()
          .map((r) => r.id),
    },
    {
      table: 'book_shelves',
      ids: (db, parentId, when) =>
        db
          .select({ id: bookShelves.id })
          .from(bookShelves)
          .where(and(eq(bookShelves.bookId, parentId), when(bookShelves.deletedAt)))
          .all()
          .map((r) => r.id),
    },
  ],
  reads: [
    {
      table: 'sessions',
      ids: (db, parentId, when) =>
        db
          .select({ id: sessions.id })
          .from(sessions)
          .where(and(eq(sessions.readId, parentId), when(sessions.deletedAt)))
          .all()
          .map((r) => r.id),
    },
  ],
  shelves: [
    {
      table: 'book_shelves',
      ids: (db, parentId, when) =>
        db
          .select({ id: bookShelves.id })
          .from(bookShelves)
          .where(and(eq(bookShelves.shelfId, parentId), when(bookShelves.deletedAt)))
          .all()
          .map((r) => r.id),
    },
  ],
}

// ─── PRIMITIVES, ALL SYNCHRONOUS AND ALL TRANSACTION-INTERNAL ────────────────

function enqueue(
  db: Database,
  table: SyncableTable,
  rowId: string,
  operation: SyncOperation,
  ts: UnixMs,
): void {
  db.insert(syncQueue)
    .values({ tableName: table, rowId, operation, queuedAt: ts, attempts: 0 })
    .run()
}

/** Soft-deletes every live descendant of `id`, depth first, enqueueing each. */
function cascadeDelete(db: Database, table: SyncableTable, id: string, ts: UnixMs): void {
  for (const child of CHILDREN[table] ?? []) {
    const t = tableFor(child.table)
    for (const childId of child.ids(db, id, isNull)) {
      db.update(t).set({ deletedAt: ts, updatedAt: ts }).where(eq(t.id, childId)).run()
      enqueue(db, child.table, childId, 'delete', ts)
      cascadeDelete(db, child.table, childId, ts)
    }
  }
}

/**
 * Reverses one cascade: restores only descendants stamped with `deletedAt`, the
 * timestamp the parent carried. Anything deleted separately keeps its own timestamp and
 * stays deleted.
 */
function cascadeRestore(
  db: Database,
  table: SyncableTable,
  id: string,
  deletedAt: UnixMs,
  ts: UnixMs,
): void {
  for (const child of CHILDREN[table] ?? []) {
    const t = tableFor(child.table)
    const matching = child.ids(db, id, (col) => eq(col, deletedAt))
    for (const childId of matching) {
      db.update(t).set({ deletedAt: null, updatedAt: ts }).where(eq(t.id, childId)).run()
      enqueue(db, child.table, childId, 'upsert', ts)
      cascadeRestore(db, child.table, childId, deletedAt, ts)
    }
  }
}

// ─── THE PUBLIC API ──────────────────────────────────────────────────────────

/**
 * Whether the write actually altered a row.
 *
 * `ok` means "the operation completed without error", which is NOT the same as "something
 * happened": deleting an already-deleted row, or one that never existed, succeeds and
 * changes nothing. Returning `void` made those indistinguishable, so a caller would show
 * "Session deleted · Undo" for a delete that did not occur — and rule 2 promises that
 * every destructive action has an undo, not that every toast has one.
 *
 * Check `changed` before showing a confirmation or an undo.
 */
export interface WriteOutcome {
  readonly changed: boolean
}

/**
 * Insert or update a row, and enqueue it for sync, atomically.
 *
 * `createdAt` is stamped on insert and NEVER touched by the update branch. It used to be
 * part of the caller's values and part of the conflict `set`, which meant every edit
 * rewrote the row's creation date to whatever the caller passed — silent, invisible, and
 * only noticeable months later as a library sorted wrongly by date added.
 *
 * `updatedAt` is stamped locally as an optimistic placeholder only. The authoritative
 * value is stamped by Postgres on push and written back. A device clock never decides
 * which side of a conflict wins. See DECISIONS.md, 2026-09-03.
 */
export async function writeRow<K extends SyncableTable>(
  table: K,
  values: RowFor<K>,
): Promise<Result<void>> {
  return attempt(
    async () => {
      const t = tableFor(table)
      const ts = now()
      // One timestamp for the row and the queue entry. Reading the clock twice can
      // produce two values and makes the pair look like two separate edits.
      const insertRow = { ...values, createdAt: ts, updatedAt: ts }

      // The conflict branch updates everything the caller supplied EXCEPT the identity
      // and the creation date. Writing `id` back to itself is harmless; writing
      // `createdAt` is the bug above.
      const { id: _identity, ...mutable } = values
      const updateSet = { ...mutable, updatedAt: ts }

      const db = getDb()

      // Synchronous, inside a real transaction. See runInTransaction in client.ts for
      // why drizzle's own transaction helper with an async callback silently fails to
      // roll back here.
      runInTransaction(() => {
        db.insert(t)
          .values(insertRow)
          .onConflictDoUpdate({ target: t.id, set: updateSet })
          .run()
        enqueue(db, table, values.id, 'upsert', ts)
      })
    },
    (cause) =>
      appError('recoverable', 'Could not save that change', {
        safe: 'Nothing else in your library was affected.',
        cause,
      }),
  )
}

/**
 * Soft delete, cascading to children. Deletes are soft everywhere, no exceptions:
 * `deleted_at` is set, the row syncs, and a purge job removes rows older than 30 days.
 * This is also what powers Recently Deleted and every undo toast.
 *
 * A row that is already deleted, or that does not exist, changes nothing and enqueues
 * NOTHING. Enqueueing a delete for a row the server may never have seen is how a replay
 * ends up processing operations against rows that are not there.
 */
export async function softDelete(
  table: SyncableTable,
  id: string,
): Promise<Result<WriteOutcome>> {
  return attempt(
    async () => {
      const t = tableFor(table)
      const ts = now()
      const db = getDb()
      let changed = false

      runInTransaction(() => {
        // `isNull(deletedAt)` in the predicate is what makes `changes` trustworthy: with
        // it, zero changed rows means "already deleted, or never existed", and both are
        // no-ops rather than a second queue row.
        const res = db
          .update(t)
          .set({ deletedAt: ts, updatedAt: ts })
          .where(and(eq(t.id, id), isNull(t.deletedAt)))
          .run()
        if (res.changes === 0) return

        changed = true
        enqueue(db, table, id, 'delete', ts)
        cascadeDelete(db, table, id, ts)
      })

      return { changed }
    },
    (cause) =>
      appError('recoverable', 'Could not remove that', {
        safe: 'It is still in your library.',
        cause,
      }),
  )
}

/**
 * Undo a soft delete, and everything that delete took with it. Enqueues an upsert,
 * because to the server this is a resurrection.
 *
 * A row that is not deleted changes nothing and enqueues nothing.
 */
export async function restoreRow(
  table: SyncableTable,
  id: string,
): Promise<Result<WriteOutcome>> {
  return attempt(
    async () => {
      const t = tableFor(table)
      const ts = now()
      const db = getDb()
      let changed = false

      runInTransaction(() => {
        // Read the timestamp BEFORE clearing it: it is the key that identifies which
        // children belonged to this delete rather than to an earlier separate one.
        const existing = db.select({ deletedAt: t.deletedAt }).from(t).where(eq(t.id, id)).all()
        const deletedAt = existing[0]?.deletedAt

        const res = db
          .update(t)
          .set({ deletedAt: null, updatedAt: ts })
          .where(and(eq(t.id, id), isNotNull(t.deletedAt)))
          .run()
        if (res.changes === 0) return

        changed = true
        enqueue(db, table, id, 'upsert', ts)
        if (typeof deletedAt === 'number') cascadeRestore(db, table, id, deletedAt, ts)
      })

      return { changed }
    },
    (cause) => appError('recoverable', 'Could not restore that', { cause }),
  )
}

/**
 * Update SOME columns of an existing live row, and enqueue it, atomically.
 *
 * `writeRow` requires a whole row, because its job is insert-or-replace. Using it to
 * change one field means reading the row, spreading it, and writing it all back — which
 * is a lost-update race (two edits in the same second, last writer wins, the other's
 * change silently gone) and, worse, a habit that spreads to every `queries.ts` file that
 * needs to change one column.
 *
 * This was deferred to Slice 2 "with the first edit screen" (DECISIONS.md, 2026-09-04).
 * Slice 1's session-recovery gate reached it first: closing a recovered session sets
 * `duration_seconds` and nothing else. Deferring further would have meant writing the
 * exact read-modify-write that entry warned against, so it lands here instead.
 *
 * `createdAt` and `deletedAt` are not patchable, for the same reasons `RowFor` omits
 * them: a creation date is not editable, and a delete goes through `softDelete` so it
 * enqueues a `delete` and runs the cascade.
 *
 * A patch that changes nothing — an empty object, a missing row, an already-deleted row —
 * enqueues nothing and reports `changed: false`.
 */
export async function updateRow<K extends SyncableTable>(
  table: K,
  id: string,
  patch: Partial<Omit<RowFor<K>, 'id'>>,
): Promise<Result<WriteOutcome>> {
  return attempt(
    async () => {
      const columns = Object.keys(patch)
      // No columns means no statement. Running `SET updated_at = ?` alone would bump the
      // row's timestamp and enqueue a sync for an edit that did not happen.
      if (columns.length === 0) return { changed: false }

      const t = tableFor(table)
      const ts = now()
      const db = getDb()
      let changed = false

      runInTransaction(() => {
        const res = db
          .update(t)
          .set({ ...patch, updatedAt: ts })
          .where(and(eq(t.id, id), isNull(t.deletedAt)))
          .run()
        if (res.changes === 0) return

        changed = true
        enqueue(db, table, id, 'upsert', ts)
      })

      return { changed }
    },
    (cause) =>
      appError('recoverable', 'Could not save that change', {
        safe: 'Nothing else in your library was affected.',
        cause,
      }),
  )
}

// ─── DRAIN ───────────────────────────────────────────────────────────────────

/**
 * No-op until Slice 8, when the body is replaced with a Supabase push and pull. Nothing
 * else in the app changes at that point, which is the entire reason the queue ships now.
 *
 * When it is implemented, two rules from DECISIONS.md are not optional:
 *   1. `updated_at` comes back from the server and is written to the local row.
 *   2. A pull SKIPS any row with a pending queue entry, or it clobbers unsynced local
 *      work.
 */
export async function drainSyncQueue(): Promise<Result<{ drained: number }>> {
  return attempt(
    async () => ({ drained: 0 }),
    (cause) => appError('offline', 'Sync will retry later', { cause }),
  )
}

/** How many writes are waiting. Powers the quiet sync indicator, never a blocking spinner. */
export async function pendingSyncCount(): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(syncQueue)
  return rows[0]?.n ?? 0
}
