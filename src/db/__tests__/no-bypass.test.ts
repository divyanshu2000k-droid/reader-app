/**
 * THE SOURCE GUARD.
 *
 * Half of the proof that no write path bypasses `sync_queue`. This half is mechanical
 * and instant: it fails the moment someone writes a direct `db.insert` outside the one
 * file allowed to have one, rather than at runtime when a reader's data goes missing.
 *
 * The other half is behavioural and needs a device: perform a write through the public
 * query API, assert exactly one matching queue row, then force the enqueue to throw and
 * assert the table write rolled back. That lives in `sync-queue.device.test.ts` and
 * runs in Slice 0's device pass.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'

const SRC = join(process.cwd(), 'src')

/** The only file permitted to call the Drizzle mutation builders directly. */
const ALLOWED = ['src/db/write.ts']

/** Files that legitimately mention the builders in prose or types, not as calls. */
const SKIP_DIRS = new Set(['migrations', '__tests__', 'node_modules'])

const FORBIDDEN = [/\bdb\.insert\s*\(/, /\bdb\.update\s*\(/, /\bdb\.delete\s*\(/]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

test('no source file writes to the database outside src/db/write.ts', () => {
  const offenders: string[] = []

  for (const file of walk(SRC)) {
    const rel = relative(process.cwd(), file).replace(/\\/g, '/')
    if (ALLOWED.includes(rel)) continue

    const source = readFileSync(file, 'utf8')
    for (const pattern of FORBIDDEN) {
      if (pattern.test(source)) {
        offenders.push(`${rel} matches ${pattern}`)
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'Every write must go through writeRow/softDelete in src/db/write.ts, which enqueues ' +
      'sync in the same transaction. Direct writes bypass the queue and lose data ' +
      'silently. See DECISIONS.md, 2026-09-03.',
  )
})

/**
 * Read the allowlist from source rather than importing it. `write.ts` pulls in
 * expo-sqlite, which cannot load outside a React Native runtime, and a guard that only
 * runs on a device is a guard that stops running.
 */
function syncableTablesFromSource(): string[] {
  const source = readFileSync(join(SRC, 'db', 'write.ts'), 'utf8')
  const block = source.match(/SYNCABLE_TABLES = \[([\s\S]*?)\] as const/)
  assert.ok(block?.[1], 'SYNCABLE_TABLES not found in src/db/write.ts')
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string)
}

test('every syncable table is a real table, and local-only tables are excluded', () => {
  const syncable = syncableTablesFromSource()
  const schemaSource = readFileSync(join(SRC, 'db', 'schema.ts'), 'utf8')

  assert.ok(syncable.length > 0, 'the syncable allowlist is empty')

  for (const name of syncable) {
    assert.ok(
      new RegExp(`sqliteTable\\(\\s*'${name}'`).test(schemaSource),
      `${name} is listed as syncable but is not a table in schema.ts`,
    )
  }

  // sync_queue and metadata_cache are local only and must never enqueue.
  assert.ok(!syncable.includes('sync_queue'), 'sync_queue must never enqueue itself')
  assert.ok(!syncable.includes('metadata_cache'), 'metadata_cache is local only')
})
