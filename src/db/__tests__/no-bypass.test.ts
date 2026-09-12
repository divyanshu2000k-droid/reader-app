/**
 * THE SOURCE GUARD.
 *
 * Half of the proof that no write path bypasses `sync_queue`. This half is mechanical
 * and instant: it fails the moment someone writes a direct `db.insert` outside the one
 * file allowed to have one, rather than at runtime when a reader's data goes missing.
 *
 * The other half is behavioural and needs a device: perform a write through the public
 * query API, assert exactly one matching queue row, then force the enqueue to throw and
 * assert the table write rolled back. It is specified in
 * `src/db/__tests__/sync-queue.device.md` and implemented in `src/db/devchecks.ts`,
 * which runs from a `__DEV__`-only button.
 *
 * There is no `sync-queue.device.test.ts`, and there cannot be: Metro excludes
 * `__tests__/` from module resolution, so a device check living there is silently not
 * bundled. This comment named that file for a while, which is exactly the kind of
 * pointer that sends the next reader looking for code that does not exist.
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

/**
 * The device pass caught this the hard way: drizzle's expo-sqlite driver is a
 * SYNCHRONOUS dialect, so `db.transaction(cb)` expects a sync callback. An `async`
 * callback typechecks — the result is just a Promise — but the transaction commits the
 * moment the callback returns that promise, before any awaited statement has run. Every
 * statement then executes outside the transaction and nothing rolls back.
 *
 * The failure is invisible: writes appear to work, and only a deliberately broken
 * `sync_queue` reveals that the pair is not atomic. Use `runInTransaction` instead.
 */
test('no async callback is passed to drizzle transaction()', () => {
  const offenders: string[] = []

  for (const file of walk(SRC)) {
    const source = readFileSync(file, 'utf8')
    if (/\.transaction\s*\(\s*async/.test(source)) {
      offenders.push(relative(process.cwd(), file).replace(/\\/g, '/'))
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'drizzle expo-sqlite is a sync dialect: an async transaction callback commits before ' +
      'its statements run, so nothing rolls back. Use runInTransaction from db/client.ts.',
  )
})

/**
 * THE SAME BUG, IN ITS REPLACEMENT.
 *
 * `runInTransaction` was typed `task: () => void`, which accepts an async function, and the
 * guard above only looked for drizzle's `.transaction(async`. So
 * `runInTransaction(async () => …)` passed every check while committing before its
 * statements ran. The type now rejects it (`__tests__/transaction.types.ts`); this catches
 * it in source as well, together with the other ways to open a transaction that bypass
 * the wrapper entirely.
 */
/**
 * Source with comments removed, so a guard judges code rather than prose. The files that
 * explain these bugs name the forbidden shapes in their comments (client.ts spells out
 * `runInTransaction(async () => …)` precisely to warn against it), and the first run of
 * the guard below failed on exactly that. Not string-aware, deliberately simple: `//`
 * after a colon is kept so a URL does not swallow the rest of its line.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** The transaction rules, as a function of one file's source, so a control can drive it. */
function transactionOffenders(rel: string, rawSource: string): string[] {
  const offenders: string[] = []
  const source = code(rawSource)
  if (/\brunInTransaction\s*\(\s*async\b/.test(source)) {
    offenders.push(`${rel}: async task passed to runInTransaction`)
  }
  if (/\.transaction\s*\(/.test(source)) {
    offenders.push(`${rel}: drizzle .transaction() instead of runInTransaction`)
  }
  if (
    !SQLITE_ALLOWED.includes(rel) &&
    /\bwith(Exclusive)?Transaction(Sync|Async)\s*\(/.test(source)
  ) {
    offenders.push(`${rel}: expo-sqlite transaction outside client.ts`)
  }
  return offenders
}

test('every transaction goes through runInTransaction, with a synchronous task', () => {
  const offenders: string[] = []

  for (const file of walk(SRC)) {
    const rel = relative(process.cwd(), file).replace(/\\/g, '/')
    offenders.push(...transactionOffenders(rel, readFileSync(file, 'utf8')))
  }

  assert.deepEqual(
    offenders,
    [],
    'Open transactions only with runInTransaction from db/client.ts, and only with a ' +
      'synchronous task: an async one commits before its statements run.',
  )
})

/**
 * POSITIVE CONTROLS. EVERY TEXTUAL GUARD MUST BE SEEN FLAGGING SOMETHING, EVERY RUN.
 *
 * A regex over source text fails in one direction only: it stops matching, passes, and
 * says nothing. That is how `columnsOf` asserted nothing for two of seven tables for a
 * whole slice, and how the transaction guard missed `runInTransaction(async …)`, a new
 * spelling of the bug it was written for. A green guard is evidence only if it is also
 * known to go red.
 *
 * These feed each guard a sample it must reject, and prose it must not. They cost
 * milliseconds, and they are what stands between a guard and vacuity after the next
 * rewrite of the code it watches.
 */
test('the write guards flag known-bad samples', () => {
  const writes = [
    'db.insert(books).values(row).run()',
    'db.update(books).set({ title }).run()',
    'db.delete(books).where(eq(books.id, id)).run()',
    'getDb().insert(books).values(row).run()',
  ]
  for (const sample of writes) {
    assert.ok(
      FORBIDDEN.some((p) => p.test(sample)),
      `the write guard no longer flags: ${sample}`,
    )
  }

  const raw = ['openDatabaseSync("reader.db")', 'handle.execSync("INSERT INTO books …")']
  for (const sample of raw) {
    assert.ok(
      FORBIDDEN_SQLITE.some((p) => p.test(sample)),
      `the raw-handle guard no longer flags: ${sample}`,
    )
  }
})

test('the transaction guard flags every shape it exists for, and no comment', () => {
  const mustFlag = [
    'runInTransaction(async () => { await write() })',
    'getDb().transaction((tx) => tx.run(q))',
    'db.transaction(async (tx) => { await tx.run(q) })',
    'handle.withTransactionAsync(async () => {})',
    'handle.withExclusiveTransactionAsync(async () => {})',
  ]
  for (const sample of mustFlag) {
    assert.ok(
      transactionOffenders('src/features/x.ts', sample).length > 0,
      `the transaction guard no longer flags: ${sample}`,
    )
  }

  // The negative control, and not hypothetical: this guard's first run failed on
  // client.ts's own comments, which name these shapes in order to warn against them.
  const prose = [
    '// never pass an async task: runInTransaction(async () => {})',
    '/* db.transaction(async …) commits before its statements run */',
  ].join('\n')
  assert.deepEqual(transactionOffenders('src/features/x.ts', prose), [])

  // And the one file allowed to open a transaction keeps its call.
  assert.deepEqual(
    transactionOffenders('src/db/client.ts', 'openHandle().withTransactionSync(task)'),
    [],
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
 * Extract one table's COLUMN OBJECT from schema.ts, by matching braces rather than by
 * regex.
 *
 * THIS IS THE SECOND VERSION, AND THE FIRST ONE ASSERTED NOTHING FOR TWO TABLES.
 *
 * It terminated the column list at the first newline-two-spaces-brace. Tables written
 * as
 * `sqliteTable('x', { ... })` — `shelves` and `goals` — close with `})` at column zero
 * and have no such line, so the match ran on into the NEXT table's body and happily
 * found that table's `id` and `...syncColumns`. Gutting `shelves` down to a single
 * column left the test passing.
 *
 * A regex cannot find the end of a nested object; brace matching can. The non-vacuity
 * check below gutted all seven tables in turn and watched this fail seven times.
 */
function columnsOf(schemaSource: string, tableName: string): string {
  const decl = schemaSource.search(new RegExp(String.raw`sqliteTable\(\s*'${tableName}'\s*,`))
  assert.notEqual(decl, -1, `${tableName} is not declared in schema.ts`)

  const open = schemaSource.indexOf('{', decl)
  assert.notEqual(open, -1, `no column object found for ${tableName}`)

  let depth = 0
  for (let i = open; i < schemaSource.length; i += 1) {
    const ch = schemaSource[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return schemaSource.slice(open + 1, i)
    }
  }
  throw new Error(`unbalanced braces reading the columns of ${tableName}`)
}

/**
 * Guards the bug that finding 2 was: `book_shelves` was registered as syncable while
 * having a composite key and no sync columns, so `softDelete` on it would have failed at
 * runtime on the first shelf removal. The compiler now catches this via `_shapeCheck` in
 * write.ts; this asserts it at the schema level too, where the mistake is actually made.
 */
/** What a table's column text is missing. A function, so a control can drive it too. */
function shapeProblems(name: string, columns: string): string[] {
  const problems: string[] = []
  if (!/id: text\('id'\)\.primaryKey\(\)/.test(columns)) {
    problems.push(`${name} needs a UUID id`)
  }
  if (!columns.includes('...syncColumns')) {
    problems.push(
      `${name} needs created_at, updated_at and deleted_at, or it cannot be soft-deleted ` +
        'and its removal cannot be undone',
    )
  }
  return problems
}

test('every syncable table has an id and the full sync columns', () => {
  const schemaSource = readFileSync(join(SRC, 'db', 'schema.ts'), 'utf8')
  const problems = syncableTablesFromSource().flatMap((name) =>
    shapeProblems(name, columnsOf(schemaSource, name)),
  )
  assert.deepEqual(problems, [])
})

test('the shape guard flags a gutted table', () => {
  // The exact mistake it exists for: `book_shelves` shipped with a composite key, no `id`
  // and no sync columns, and the first version of this guard read the NEXT table's columns
  // and passed anyway.
  assert.equal(shapeProblems('gutted', "bookId: text('book_id').notNull(),").length, 2)
  assert.equal(shapeProblems('noSync', "id: text('id').primaryKey(),").length, 1)
  assert.deepEqual(
    shapeProblems('whole', "id: text('id').primaryKey(),\n  ...syncColumns,"),
    [],
  )
})

/**
 * The extractor must stop at the table it was asked about.
 *
 * This is the assertion that would have failed on the first version: `columnsOf` used to
 * run past the end of `shelves` and read `book_shelves`, so a gutted table borrowed a
 * later table's columns and passed. Length is a crude proxy, but a body that has
 * swallowed a whole other table is an order of magnitude too long, and `shelves` is
 * exactly the table the old regex could not terminate.
 */
test('the column extractor stops at the table it was asked for', () => {
  const schemaSource = readFileSync(join(SRC, 'db', 'schema.ts'), 'utf8')

  const shelves = columnsOf(schemaSource, 'shelves')
  assert.ok(
    !shelves.includes('book_id'),
    'columnsOf ran past shelves into book_shelves - the guard is vacuous again',
  )

  const goals = columnsOf(schemaSource, 'goals')
  assert.ok(
    !goals.includes('table_name'),
    'columnsOf ran past goals into sync_queue - the guard is vacuous again',
  )
})
