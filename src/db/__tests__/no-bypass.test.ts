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

/** The only file permitted to touch the raw expo-sqlite handle. */
const SQLITE_ALLOWED = ['src/db/client.ts']

/** Files that legitimately mention the builders in prose or types, not as calls. */
const SKIP_DIRS = new Set(['migrations', '__tests__', 'node_modules'])

const FORBIDDEN = [
  /\bgetDb\(\)\s*\.\s*insert\s*\(/,
  /\bgetDb\(\)\s*\.\s*update\s*\(/,
  /\bgetDb\(\)\s*\.\s*delete\s*\(/,
  /\bdb\.insert\s*\(/,
  /\bdb\.update\s*\(/,
  /\bdb\.delete\s*\(/,
]

/**
 * The raw expo-sqlite handle bypasses Drizzle entirely, so `execSync('INSERT …')` would
 * slip past every check above. `client.ts` does not export it, and this asserts that
 * nobody reintroduces an export or opens a second connection.
 */
const FORBIDDEN_SQLITE = [/\bopenDatabaseSync\s*\(/, /\bexecSync\s*\(/, /\brunSync\s*\(/]

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

test('no source file touches the raw expo-sqlite handle outside src/db/client.ts', () => {
  const offenders: string[] = []

  for (const file of walk(SRC)) {
    const rel = relative(process.cwd(), file).replace(/\\/g, '/')
    if (SQLITE_ALLOWED.includes(rel)) continue

    const source = readFileSync(file, 'utf8')
    for (const pattern of FORBIDDEN_SQLITE) {
      if (pattern.test(source)) offenders.push(`${rel} matches ${pattern}`)
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'The raw SQLite handle bypasses Drizzle and therefore the sync queue. Use writeRow ' +
      'and softDelete in src/db/write.ts.',
  )
})

test('client.ts does not export the raw SQLite handle', () => {
  const source = readFileSync(join(SRC, 'db', 'client.ts'), 'utf8')
  assert.ok(
    !/export\s+(const|let)\s+\w*[sS]qliteDb/.test(source),
    'Exporting the raw handle makes an un-enqueued write reachable from anywhere.',
  )
})

/**
 * Read the allowlist from source rather than importing it. `write.ts` pulls in
 * expo-sqlite, which cannot load outside a React Native runtime, and a guard that only
 * runs on a device is a guard that stops running.
 */
function syncableTablesFromSource(): string[] {
  const source = readFileSync(join(SRC, 'db', 'write.ts'), 'utf8')
  const block = source.match(/const SYNCABLE = \{([\s\S]*?)\} as const/)
  assert.ok(block?.[1], 'the SYNCABLE registry was not found in src/db/write.ts')
  return [...block[1].matchAll(/^\s{2}(\w+)[,:]/gm)].map((m) => m[1] as string)
}

test('every syncable table is a real table, and local-only tables are excluded', () => {
  const syncable = syncableTablesFromSource()
  const schemaSource = readFileSync(join(SRC, 'db', 'schema.ts'), 'utf8')

  assert.ok(syncable.length > 0, 'the syncable registry is empty')

  for (const name of syncable) {
    assert.ok(
      new RegExp(`sqliteTable\\(\\s*'${name}'`).test(schemaSource),
      `${name} is registered as syncable but is not a table in schema.ts`,
    )
  }

  // sync_queue and metadata_cache are local only and must never enqueue.
  assert.ok(!syncable.includes('sync_queue'), 'sync_queue must never enqueue itself')
  assert.ok(!syncable.includes('metadata_cache'), 'metadata_cache is local only')
})

/**
 * Guards the bug that finding 2 was: `book_shelves` was registered as syncable while
 * having a composite key and no sync columns, so `softDelete` on it would have failed at
 * runtime on the first shelf removal. The compiler now catches this via `_shapeCheck` in
 * write.ts; this asserts it at the schema level too, where the mistake is actually made.
 */
test('every syncable table has an id and the full sync columns', () => {
  const schemaSource = readFileSync(join(SRC, 'db', 'schema.ts'), 'utf8')

  for (const name of syncableTablesFromSource()) {
    const body = schemaSource.match(
      new RegExp(`sqliteTable\\(\\s*'${name}',\\s*\\{([\\s\\S]*?)\\n  \\}`),
    )
    assert.ok(body?.[1], `could not read the column list for ${name}`)

    assert.match(body[1], /id: text\('id'\)\.primaryKey\(\)/, `${name} needs a UUID id`)
    assert.ok(
      body[1].includes('...syncColumns'),
      `${name} needs created_at, updated_at and deleted_at, or it cannot be soft-deleted ` +
        'and its removal cannot be undone',
    )
  }
})
