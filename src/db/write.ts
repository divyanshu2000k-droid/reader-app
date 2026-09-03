/**
 * src/db/write.ts
 *
 * THE ONLY WRITE PATH IN THE APP.
 *
 * Every write to a syncable table goes through here, and the table write plus the
 * `sync_queue` append happen in one transaction. Both or neither.
 *
 * `queries.ts` files call these functions and never call `db.insert`, `db.update` or
 * `db.delete` directly. A test in `src/db/__tests__/no-bypass.test.ts` greps the source
 * and fails if anything does, because "remember to enqueue" is not a strategy that
 * survives twelve slices.
 *
 * The drain is a no-op until Slice 8. That is deliberate: retrofitting the enqueue into
 * a dozen working query functions in week fourteen means the ones you miss are
 * discovered as a reader's missing data. See DECISIONS.md, 2026-09-03.
 */

import { eq, sql } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

import { db } from './client'
import { syncQueue } from './schema'
import { now } from '@/lib/dates'
import { appError, attempt, type Result } from '@/lib/result'

/**
 * Tables that sync. `sync_queue` and `metadata_cache` are deliberately absent: both are
 * local-only and must never enqueue.
 */
export const SYNCABLE_TABLES = [
  'books',
  'reads',
  'sessions',
  'shelves',
  'book_shelves',
  'notes',
  'goals',
] as const

export type SyncableTable = (typeof SYNCABLE_TABLES)[number]

export function isSyncable(name: string): name is SyncableTable {
  return (SYNCABLE_TABLES as readonly string[]).includes(name)
}

interface WriteOptions {
  /** The table's SQL name, used for the queue row. */
  readonly table: SyncableTable
  /** The row's UUID primary key. */
  readonly id: string
}

/**
 * Insert or replace a row, and enqueue it for sync, atomically.
 *
 * `updatedAt` is stamped locally as an optimistic placeholder only. The authoritative
 * value is stamped by Postgres on push and written back. A device clock never decides
 * which side of a conflict wins. See DECISIONS.md, 2026-09-03.
 */
export async function writeRow<T extends SQLiteTable>(
  table: T,
  meta: WriteOptions,
  values: T['$inferInsert'],
): Promise<Result<void>> {
  return attempt(
    async () => {
      await db.transaction(async (tx) => {
        await tx
          .insert(table)
          .values({ ...values, updatedAt: now() } as T['$inferInsert'])
          .onConflictDoUpdate({
            target: (table as unknown as { id: never }).id,
            set: { ...values, updatedAt: now() } as never,
          })
        await tx.insert(syncQueue).values({
          tableName: meta.table,
          rowId: meta.id,
          operation: 'upsert',
          queuedAt: now(),
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
export async function softDelete(
  table: SQLiteTable,
  meta: WriteOptions,
): Promise<Result<void>> {
  return attempt(
    async () => {
      await db.transaction(async (tx) => {
        const ts = now()
        await tx
          .update(table)
          .set({ deletedAt: ts, updatedAt: ts } as never)
          .where(eq((table as unknown as { id: never }).id, meta.id as never))
        await tx.insert(syncQueue).values({
          tableName: meta.table,
          rowId: meta.id,
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
export async function restoreRow(
  table: SQLiteTable,
  meta: WriteOptions,
): Promise<Result<void>> {
  return attempt(
    async () => {
      await db.transaction(async (tx) => {
        const ts = now()
        await tx
          .update(table)
          .set({ deletedAt: null, updatedAt: ts } as never)
          .where(eq((table as unknown as { id: never }).id, meta.id as never))
        await tx.insert(syncQueue).values({
          tableName: meta.table,
          rowId: meta.id,
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
  const rows = await db.select({ n: sql<number>`count(*)` }).from(syncQueue)
  return rows[0]?.n ?? 0
}
