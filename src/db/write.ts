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

import { eq, sql } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'

import { getDb } from './client'
import { bookShelves, books, goals, notes, reads, sessions, shelves, syncQueue } from './schema'
import { now } from '@/lib/dates'
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

/** The insert shape for one syncable table, e.g. `RowFor<'sessions'>`. */
export type RowFor<K extends SyncableTable> = (typeof SYNCABLE)[K]['$inferInsert']

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
 * `updatedAt` or `deletedAt`. The public API of this module is fully typed.
 */
function tableFor(name: SyncableTable): SyncableShape {
  return SYNCABLE[name] as unknown as SyncableShape
}

/**
 * Insert or update a row, and enqueue it for sync, atomically.
 *
 * `updatedAt` is stamped locally as an optimistic placeholder only. The authoritative
 * value is stamped by Postgres on push and written back. A device clock never decides
 * which side of a conflict wins. See DECISIONS.md, 2026-09-03.
 */
export async function writeRow<K extends SyncableTable>(
  table: K,
  values: RowFor<K> & { id: string },
): Promise<Result<void>> {
  return attempt(
    async () => {
      const t = tableFor(table)
      const ts = now()
      // One timestamp for the row and the queue entry. Reading the clock twice can
      // produce two values and makes the pair look like two separate edits.
      const row = { ...values, updatedAt: ts }

      await getDb().transaction(async (tx) => {
        await tx
          .insert(t)
          .values(row)
          .onConflictDoUpdate({ target: t.id, set: row })
        await tx.insert(syncQueue).values({
          tableName: table,
          rowId: values.id,
          operation: 'upsert',
          queuedAt: ts,
          attempts: 0,
        })
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
 * Soft delete. Deletes are soft everywhere, no exceptions: `deleted_at` is set, the row
 * syncs, and a purge job removes rows older than 30 days. This is also what powers
 * Recently Deleted and every undo toast.
 */
export async function softDelete(table: SyncableTable, id: string): Promise<Result<void>> {
  return attempt(
    async () => {
      const t = tableFor(table)
      const ts = now()

      await getDb().transaction(async (tx) => {
        await tx.update(t).set({ deletedAt: ts, updatedAt: ts }).where(eq(t.id, id))
        await tx.insert(syncQueue).values({
          tableName: table,
          rowId: id,
          operation: 'delete',
          queuedAt: ts,
          attempts: 0,
        })
      })
    },
    (cause) =>
      appError('recoverable', 'Could not remove that', {
        safe: 'It is still in your library.',
        cause,
      }),
  )
}

/** Undo a soft delete. Enqueues an upsert, because to the server this is a resurrection. */
export async function restoreRow(table: SyncableTable, id: string): Promise<Result<void>> {
  return attempt(
    async () => {
      const t = tableFor(table)
      const ts = now()

      await getDb().transaction(async (tx) => {
        await tx.update(t).set({ deletedAt: null, updatedAt: ts }).where(eq(t.id, id))
        await tx.insert(syncQueue).values({
          tableName: table,
          rowId: id,
          operation: 'upsert',
          queuedAt: ts,
          attempts: 0,
        })
      })
    },
    (cause) => appError('recoverable', 'Could not restore that', { cause }),
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
  const rows = await getDb().select({ n: sql<number>`count(*)` }).from(syncQueue)
  return rows[0]?.n ?? 0
}
