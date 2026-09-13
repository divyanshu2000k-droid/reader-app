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
import { now, toLocalDay, type UnixMs } from '@/lib/dates'
import { appError, attempt, type AppError, type Result } from '@/lib/result'
import { errors } from '@/lib/strings'

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
  'createdAt' | 'updatedAt' | 'deletedAt' | DerivedColumn<K>
> & { id: string }

/**
 * Columns the write path DERIVES, which a caller therefore cannot supply.
 *
 * `sessions.local_day` is the calendar day of `occurred_at` in the device timezone, and the
 * contract is that it is written whenever `occurred_at` is written and never otherwise
 * (docs/03-DATA-MODEL.md). While callers supplied it, nothing held them to that:
 * `updateRow` accepted a new `occurredAt` with no `localDay`, and the session stayed filed
 * under its old day in every streak, pace chart and yearly total. It is now computed here
 * from the `occurredAt` actually being written, and passing it is a compile error.
 */
type DerivedColumn<K extends SyncableTable> = K extends 'sessions' ? 'localDay' : never

/**
 * What `updateRow` accepts: any subset of a row's writable columns, where a key that is
 * present must carry a real value. `null` clears a nullable column and is allowed;
 * `undefined` is not a write and is rejected.
 *
 * Drizzle's insert types spell `| undefined` into every optional column, so
 * `exactOptionalPropertyTypes` alone does not stop `{ note: undefined }`. Stripping it here,
 * WITH that flag on, does. The runtime count in `updateRow` still holds for values that
 * never passed through the compiler.
 */
export type PatchFor<K extends SyncableTable> = {
  [P in keyof Omit<RowFor<K>, 'id'>]?: Exclude<Omit<RowFor<K>, 'id'>[P], undefined>
}

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

// ─── LOCAL_DAY, DERIVED FROM OCCURRED_AT ─────────────────────────────────────

/** The `occurredAt` a sessions write carries, or null for any other table or none given. */
function occurredAtOf(table: SyncableTable, values: object): UnixMs | null {
  if (table !== 'sessions' || !('occurredAt' in values) || values.occurredAt === undefined) {
    return null
  }
  const at = values.occurredAt
  if (typeof at !== 'number' || !Number.isFinite(at)) {
    throw new Error(`occurredAt must be unix milliseconds, got ${String(at)}`)
  }
  return at
}

/**
 * `local_day` for a write that sets `occurred_at` on an EXISTING row: kept when the instant
 * is unchanged, recomputed when it moved. SQL evaluates every SET expression against the
 * row as it was before the statement, so `"occurred_at"` here is the stored value — in a
 * plain UPDATE and in an upsert's DO UPDATE alike.
 *
 * Never an unconditional recompute: the stored day is the day the reader experienced, in
 * the timezone they were in. Rewriting the same instant from a phone that is now in Tokyo
 * would move last Tuesday's reading to Wednesday, which the contract's third rule forbids.
 */
function localDayOnUpdate(occurredAt: UnixMs): SQL {
  return sql`CASE WHEN "occurred_at" = ${occurredAt} THEN "local_day" ELSE ${toLocalDay(occurredAt)} END`
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

// ─── NO LIVE ROW UNDER A DELETED PARENT ──────────────────────────────────────

/**
 * WHO A ROW BELONGS TO, for the one rule the cascade exists to keep: no live row points at
 * a deleted parent. A live session under a deleted read keeps counting in every statistic,
 * and no screen can explain the number.
 *
 * The cascade enforced it on the way down and nothing enforced it on the way back up. A
 * book deleted, then its shelf deleted, then the book restored, brought back a live
 * assignment to a deleted shelf. A session restored on its own came back live under a
 * read deleted since. And `writeRow` / `updateRow` would attach or move a row onto a
 * deleted parent without complaint. All three now run this check inside their transaction
 * and roll back.
 *
 * `notes.read_id` is deliberately absent: it is provenance, and a note belongs to its book.
 */
interface ParentLink {
  readonly parent: SyncableTable
  /** True when the row `id`'s parent through this link exists and is soft-deleted. */
  readonly isDeleted: (db: Database, id: string) => boolean
}

const PARENTS: Partial<Record<SyncableTable, readonly ParentLink[]>> = {
  reads: [
    {
      parent: 'books',
      isDeleted: (db, id) =>
        db
          .select({ d: books.deletedAt })
          .from(reads)
          .innerJoin(books, eq(reads.bookId, books.id))
          .where(eq(reads.id, id))
          .all()
          .some((r) => r.d !== null),
    },
  ],
  sessions: [
    {
      parent: 'reads',
      isDeleted: (db, id) =>
        db
          .select({ d: reads.deletedAt })
          .from(sessions)
          .innerJoin(reads, eq(sessions.readId, reads.id))
          .where(eq(sessions.id, id))
          .all()
          .some((r) => r.d !== null),
    },
  ],
  notes: [
    {
      parent: 'books',
      isDeleted: (db, id) =>
        db
          .select({ d: books.deletedAt })
          .from(notes)
          .innerJoin(books, eq(notes.bookId, books.id))
          .where(eq(notes.id, id))
          .all()
          .some((r) => r.d !== null),
    },
  ],
  book_shelves: [
    {
      parent: 'books',
      isDeleted: (db, id) =>
        db
          .select({ d: books.deletedAt })
          .from(bookShelves)
          .innerJoin(books, eq(bookShelves.bookId, books.id))
          .where(eq(bookShelves.id, id))
          .all()
          .some((r) => r.d !== null),
    },
    {
      parent: 'shelves',
      isDeleted: (db, id) =>
        db
          .select({ d: shelves.deletedAt })
          .from(bookShelves)
          .innerJoin(shelves, eq(bookShelves.shelfId, shelves.id))
          .where(eq(bookShelves.id, id))
          .all()
          .some((r) => r.d !== null),
    },
  ],
}

/** What the reader calls each parent, in "restore the … first". */
const NOUN: Record<SyncableTable, string> = {
  books: 'book',
  reads: 'read',
  sessions: 'session',
  shelves: 'shelf',
  book_shelves: 'shelf assignment',
  notes: 'note',
  goals: 'goal',
}

class ParentDeletedError extends Error {
  readonly parent: SyncableTable
  constructor(table: SyncableTable, parent: SyncableTable) {
    super(`a ${table} row would be live under a deleted ${parent} row`)
    this.name = 'ParentDeletedError'
    this.parent = parent
  }
}

function deletedParentOf(db: Database, table: SyncableTable, id: string): SyncableTable | null {
  for (const link of PARENTS[table] ?? []) if (link.isDeleted(db, id)) return link.parent
  return null
}

/** Throws inside the caller's transaction, so the write it guards rolls back. */
function assertParentsLive(db: Database, table: SyncableTable, id: string): void {
  const parent = deletedParentOf(db, table, id)
  if (parent) throw new ParentDeletedError(table, parent)
}

/** An error's message and every `cause` beneath it: drizzle wraps SQLite's own text. */
function causeText(cause: unknown): string {
  const parts: string[] = []
  let c: unknown = cause
  for (let i = 0; i < 5 && c instanceof Error; i += 1) {
    parts.push(c.message)
    c = 'cause' in c ? c.cause : undefined
  }
  return parts.join(' <- ')
}

/**
 * The reader-facing failure for a write, naming the cause when it is one they can act on:
 * a deleted parent to restore first, or a clash with a row added since (an undo of read #1
 * after a new read #1, a shelf assignment re-added before its old one is restored).
 */
function writeFailure(cause: unknown, message: string, safe: string): AppError {
  if (cause instanceof ParentDeletedError) {
    return appError('recoverable', message, {
      safe: errors.parentDeleted(NOUN[cause.parent]),
      cause,
    })
  }
  if (/UNIQUE constraint failed/i.test(causeText(cause))) {
    return appError('recoverable', message, { safe: errors.writeClash, cause })
  }
  return appError('recoverable', message, { safe, cause })
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

/**
 * ONE ROW'S UPSERT: derive, write, check its parents, enqueue. Transaction-internal.
 *
 * The single implementation shared by `writeRow` and `writeBatch`. A second copy is how
 * the derived `local_day`, the parent check or the enqueue ends up holding in one entry
 * point and not the other — which is this codebase's most expensive recurring mistake.
 *
 * `createdAt` is stamped on insert and NEVER touched by the update branch: it used to be
 * part of the caller's values and part of the conflict `set`, so every edit reset the
 * row's creation date. `local_day` moves only if the instant moved.
 */
function upsertOne<K extends SyncableTable>(
  db: Database,
  table: K,
  values: RowFor<K>,
  ts: UnixMs,
): void {
  const t = tableFor(table)
  const occurredAt = occurredAtOf(table, values)
  if (table === 'sessions' && occurredAt === null) {
    throw new Error('a session cannot be written without occurredAt')
  }
  const { id: _identity, ...mutable } = values
  db.insert(t)
    .values({
      ...values,
      ...(occurredAt === null ? {} : { localDay: toLocalDay(occurredAt) }),
      createdAt: ts,
      updatedAt: ts,
    })
    .onConflictDoUpdate({
      target: t.id,
      set: {
        ...mutable,
        ...(occurredAt === null ? {} : { localDay: localDayOnUpdate(occurredAt) }),
        updatedAt: ts,
      },
    })
    .run()
  assertParentsLive(db, table, values.id)
  enqueue(db, table, values.id, 'upsert', ts)
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
      // A child with ANOTHER parent that is still deleted stays deleted, with its subtree:
      // restoring a book must not revive its assignment to a shelf deleted since.
      if (deletedParentOf(db, child.table, childId) !== null) continue
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
      const ts = now()
      const db = getDb()

      // Synchronous, inside a real transaction. See runInTransaction in client.ts for
      // why drizzle's own transaction helper with an async callback silently fails to
      // roll back here.
      runInTransaction(() => {
        upsertOne(db, table, values, ts)
      })
    },
    (cause) =>
      writeFailure(
        cause,
        'Could not save that change',
        'Nothing else in your library was affected.',
      ),
  )
}

/**
 * Insert or update MANY rows, and enqueue every one of them, in ONE transaction.
 *
 * All or none. A 2000-book seed, and Slice 9's import, are one atomic action: a partial
 * library is worse than none, and a partial import cannot be retried honestly.
 *
 * It exists for a second reason too: 2000 calls to `writeRow` are 2000 transactions, which
 * on a phone is minutes rather than seconds. That is not a reason to bypass the write path,
 * which is why this is IN it — every row still gets its `sync_queue` entry, its parent
 * check and its derived `local_day`, through the same `upsertOne` that `writeRow` uses.
 * One implementation, so the rules cannot hold in one place and not the other.
 *
 * The caller shows ONE toast for the batch, never one per row (04-SCREENS, global rules).
 */
export async function writeBatch<K extends SyncableTable>(
  table: K,
  rows: readonly RowFor<K>[],
): Promise<Result<{ written: number }>> {
  return attempt(
    async () => {
      if (rows.length === 0) return { written: 0 }
      const ts = now()
      const db = getDb()
      runInTransaction(() => {
        for (const values of rows) upsertOne(db, table, values, ts)
      })
      return { written: rows.length }
    },
    (cause) =>
      writeFailure(cause, 'Could not save those changes', 'Your library was not changed.'),
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
        // Refused, and rolled back, if its parent is still deleted: restore the parent
        // first, which brings this back with it if they were deleted together.
        assertParentsLive(db, table, id)
        enqueue(db, table, id, 'upsert', ts)
        if (typeof deletedAt === 'number') cascadeRestore(db, table, id, deletedAt, ts)
      })

      return { changed }
    },
    (cause) => writeFailure(cause, 'Could not restore that', 'Nothing was changed.'),
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
 * A patch that changes nothing — an empty object, one whose every value is `undefined`, a
 * missing row, an already-deleted row — enqueues nothing and reports `changed: false`.
 *
 * `occurredAt` carries `local_day` with it (see `localDayOnUpdate`); `localDay` itself is
 * not patchable, because a day that moves without its instant is how they came apart.
 */
export async function updateRow<K extends SyncableTable>(
  table: K,
  id: string,
  patch: PatchFor<K>,
): Promise<Result<WriteOutcome>> {
  return attempt(
    async () => {
      // Count only keys that will actually be written. Drizzle drops `undefined` values
      // from SET, so `{ note: undefined }` used to pass a key count of one, run
      // `SET updated_at = ?` alone, report `changed: true` and enqueue a sync for an edit
      // that did not happen. `null` is a real write (clear the column) and counts.
      const writes = Object.entries(patch).filter(([, value]) => value !== undefined).length
      if (writes === 0) return { changed: false }

      const t = tableFor(table)
      const ts = now()
      const occurredAt = occurredAtOf(table, patch)
      const derived = occurredAt === null ? {} : { localDay: localDayOnUpdate(occurredAt) }
      const db = getDb()
      let changed = false

      runInTransaction(() => {
        const res = db
          .update(t)
          .set({ ...patch, ...derived, updatedAt: ts })
          .where(and(eq(t.id, id), isNull(t.deletedAt)))
          .run()
        if (res.changes === 0) return

        changed = true
        // Moving a row onto a deleted parent is refused and rolled back.
        assertParentsLive(db, table, id)
        enqueue(db, table, id, 'upsert', ts)
      })

      return { changed }
    },
    (cause) =>
      writeFailure(
        cause,
        'Could not save that change',
        'Nothing else in your library was affected.',
      ),
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
