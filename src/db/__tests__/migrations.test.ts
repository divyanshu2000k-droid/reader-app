/**
 * EVERY MIGRATION, APPLIED TO A POPULATED DATABASE OF THE PREVIOUS SCHEMA.
 *
 * "A fresh install is not a test of a migration" (CLAUDE.md, silent-pass item 5). Migration
 * `0001` passed every local check and applied cleanly to an empty database, and against a
 * populated v1 database it failed on the first constraint it added — which would have left
 * every existing reader stuck on the old schema, retrying a doomed migration on every launch.
 *
 * Until now the only check was a procedure run by hand on a phone. This runs the real SQL
 * files under `node:sqlite`, the way drizzle's migrator does: split on the breakpoint marker,
 * all pending statements in ONE transaction, one row per migration in `__drizzle_migrations`.
 *
 * What it cannot see: expo-sqlite itself, the WAL, and the startup SEQUENCE around the
 * migration (read the count, checkpoint, back up). Those stay on the device, and
 * `06-CONVENTIONS.md` says so.
 *
 * AND A VERSION GAP, stated rather than hidden: node's SQLite was 3.51.3 on 2026-09-13, and
 * expo-sqlite bundles 3.50.3 (`node_modules/expo-sqlite/vendor/sqlite3/sqlite3.h`, and device
 * check 0 on the phone the same day). A migration using anything newer than the phone's
 * version would pass here and fail on every phone. Device check 0 prints the phone's version. Until a check can see
 * syntax, a migration that uses a recent SQLite feature is run on the device before it ships.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import { isPending } from '../migrationPlan'

const DIR = join(process.cwd(), 'src', 'db', 'migrations')
const journal = JSON.parse(readFileSync(join(DIR, 'meta', '_journal.json'), 'utf8')) as {
  entries: { idx: number; when: number; tag: string }[]
}

function statementsOf(tag: string): string[] {
  return readFileSync(join(DIR, `${tag}.sql`), 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** As drizzle's SQLite migrator does it: every statement of the batch in one transaction. */
function migrate(
  db: DatabaseSync,
  upTo: number,
  override?: { idx: number; statements: string[] },
) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY, hash text NOT NULL, created_at numeric)',
  )
  const last = db.prepare('select max(created_at) as last from __drizzle_migrations').get() as {
    last: number | null
  }
  db.exec('BEGIN')
  try {
    for (const entry of journal.entries) {
      if (entry.idx > upTo) break
      // The app's own rule (migrationPlan.ts), not a copy of drizzle's written again here.
      if (!isPending(entry.when, last.last)) continue
      const statements =
        override?.idx === entry.idx ? override.statements : statementsOf(entry.tag)
      for (const sql of statements) db.exec(sql)
      db.prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)').run(
        '',
        entry.when,
      )
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/** Deterministic, so a failure reproduces. */
function prng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Seeded {
  /** Books holding two LIVE reads both numbered 1: the shape 0001's unique index forbids. */
  readonly duplicated: string[]
  /** A book whose duplicate read is soft-deleted: the partial index must leave it alone. */
  readonly deletedDuplicate: string
}

/**
 * A v1 library at the scale Slice 2 requires: 2000 books, reads, sessions, shelves, notes,
 * a sync queue — and the violating shapes that only a real, unconstrained v1 database holds.
 */
function seedV1(db: DatabaseSync): Seeded {
  const rnd = prng(20260913)
  const t0 = 1_780_000_000_000
  const book = db.prepare(
    'insert into books (id, title, author, page_count, source, created_at, updated_at, deleted_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const read = db.prepare(
    'insert into reads (id, book_id, status, rating, is_private, read_number, created_at, updated_at, deleted_at) values (?, ?, ?, ?, 1, ?, ?, ?, ?)',
  )
  const session = db.prepare(
    'insert into sessions (id, read_id, occurred_at, local_day, format, from_position, to_position, duration_seconds, is_timed, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const shelf = db.prepare(
    'insert into shelves (id, name, sort_order, created_at, updated_at) values (?, ?, ?, ?, ?)',
  )
  const assign = db.prepare(
    'insert into book_shelves (id, book_id, shelf_id, added_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
  )
  const note = db.prepare(
    "insert into notes (id, book_id, type, content, created_at, updated_at) values (?, ?, 'note', ?, ?, ?)",
  )
  const queue = db.prepare(
    "insert into sync_queue (table_name, row_id, operation, queued_at, attempts) values ('books', ?, 'upsert', ?, 0)",
  )

  const duplicated: string[] = []
  let deletedDuplicate = ''
  db.exec('BEGIN')
  for (let s = 0; s < 4; s += 1) shelf.run(`sh-${s}`, `Shelf ${s}`, s, t0, t0)
  for (let i = 0; i < 2000; i += 1) {
    const b = `bk-${i}`
    book.run(
      b,
      `Book ${i}`,
      i % 30 === 0 ? null : `Author ${i % 97}`,
      i % 4 === 0 ? null : 200 + (i % 500),
      'import',
      t0 + i,
      t0 + i,
      i % 50 === 0 ? t0 + 9 : null,
    )
    queue.run(b, t0 + i)
    read.run(
      `rd-${i}-a`,
      b,
      i % 3 === 0 ? 'finished' : 'reading',
      null,
      1,
      t0 + i,
      t0 + i,
      null,
    )
    // Every 40th book: a second LIVE read, also numbered 1. v1 enforced nothing.
    if (i % 40 === 1) {
      read.run(`rd-${i}-b`, b, 'reading', null, 1, t0 + i + 1, t0 + i + 1, null)
      duplicated.push(b)
    }
    // One book whose duplicate is soft-deleted, which the partial index does not see.
    if (i === 7) {
      read.run(`rd-${i}-gone`, b, 'finished', null, 1, t0 + i + 2, t0 + i + 2, t0 + 99)
      deletedDuplicate = b
    }
    const n = Math.floor(rnd() * 6)
    for (let k = 0; k < n; k += 1) {
      session.run(
        `se-${i}-${k}`,
        `rd-${i}-a`,
        t0 + k,
        '2026-06-01',
        'pages',
        k * 10,
        k * 10 + 10,
        rnd() < 0.3 ? 900 : null,
        0,
        t0,
        t0,
      )
    }
    if (i % 11 === 0) assign.run(`as-${i}`, b, `sh-${i % 4}`, t0, t0, t0)
    if (i % 13 === 0) note.run(`nt-${i}`, b, `Note ${i}`, t0, t0)
  }
  db.exec('COMMIT')
  return { duplicated, deletedDuplicate }
}

/** Every row of a table, ordered, hashed: "nothing was lost" as a fact, not a claim. */
function fingerprint(db: DatabaseSync, table: string, exclude: readonly string[] = []): string {
  const cols = (db.prepare(`pragma table_info(${table})`).all() as { name: string }[])
    .map((c) => c.name)
    .filter((c) => !exclude.includes(c))
  const rows = db.prepare(`select ${cols.join(', ')} from ${table} order by ${cols[0]}`).all()
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

function v1Database(): { db: DatabaseSync; seeded: Seeded } {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db, 0)
  return { db, seeded: seedV1(db) }
}

test('every migration applies to an empty database, in order', () => {
  const db = new DatabaseSync(':memory:')
  migrate(db, journal.entries.length - 1)
  const applied = db.prepare('select count(*) as n from __drizzle_migrations').get() as {
    n: number
  }
  assert.equal(applied.n, journal.entries.length)
})

/**
 * THE POSITIVE CONTROL, and it runs first on purpose. The fixture must genuinely hold the
 * shape 0001 forbids, or the next test proves nothing. So: 0001 WITHOUT its repair — the
 * file drizzle-kit actually generated — must fail on this database.
 */
test('the populated v1 fixture genuinely violates what 0001 adds', () => {
  const { db } = v1Database()
  const generatedOnly = statementsOf('0001_medical_red_shift').filter(
    (s) => !/INSERT INTO sync_queue|UPDATE reads/i.test(s),
  )
  assert.throws(
    () => migrate(db, 1, { idx: 1, statements: generatedOnly }),
    /UNIQUE constraint failed: reads\.book_id, reads\.read_number/,
  )
  // And the failure rolled back: still v1, as drizzle's transaction promises.
  const applied = db.prepare('select count(*) as n from __drizzle_migrations').get() as {
    n: number
  }
  assert.equal(applied.n, 1)
})

test('0001 applies to a POPULATED v1 database, repairs it, and loses nothing', () => {
  const { db, seeded } = v1Database()
  assert.ok(
    seeded.duplicated.length >= 40,
    `too few violating books to mean anything: ${seeded.duplicated.length}`,
  )

  const before = {
    books: fingerprint(db, 'books'),
    sessions: fingerprint(db, 'sessions'),
    shelves: fingerprint(db, 'shelves'),
    assignments: fingerprint(db, 'book_shelves'),
    notes: fingerprint(db, 'notes'),
    readsIdentity: fingerprint(db, 'reads', ['read_number', 'updated_at']),
    queue: (db.prepare('select count(*) as n from sync_queue').get() as { n: number }).n,
    deletedDuplicate: JSON.stringify(
      db
        .prepare('select * from reads where book_id = ? order by id')
        .all(seeded.deletedDuplicate),
    ),
  }

  // Exactly 0001. Later migrations add columns, which changes a whole-table fingerprint; each
  // has its own populated test below.
  migrate(db, 1)

  // Every live book now has distinct read numbers, 1..n in creation order.
  const clashes = db
    .prepare(
      'select book_id, read_number, count(*) n from reads where deleted_at is null group by book_id, read_number having n > 1',
    )
    .all()
  assert.deepEqual(clashes, [], 'live reads still share a number')
  for (const b of seeded.duplicated) {
    const numbers = (
      db
        .prepare(
          'select read_number from reads where book_id = ? and deleted_at is null order by created_at, id',
        )
        .all(b) as { read_number: number }[]
    ).map((r) => r.read_number)
    assert.deepEqual(numbers, [1, 2], `${b} was not renumbered in creation order`)
  }

  // Nothing else moved. Reads differ only in read_number and updated_at.
  assert.equal(fingerprint(db, 'books'), before.books, 'books changed')
  assert.equal(fingerprint(db, 'sessions'), before.sessions, 'sessions changed')
  assert.equal(fingerprint(db, 'shelves'), before.shelves, 'shelves changed')
  assert.equal(fingerprint(db, 'book_shelves'), before.assignments, 'shelf assignments changed')
  assert.equal(fingerprint(db, 'notes'), before.notes, 'notes changed')
  assert.equal(
    fingerprint(db, 'reads', ['read_number', 'updated_at']),
    before.readsIdentity,
    'reads lost or changed',
  )

  // The soft-deleted duplicate is outside the partial index, and left exactly as it was.
  assert.equal(
    JSON.stringify(
      db
        .prepare('select * from reads where book_id = ? order by id')
        .all(seeded.deletedDuplicate),
    ),
    before.deletedDuplicate,
  )

  // The repair is a write, so it syncs: one upsert per live read of each repaired book.
  const queued = (db.prepare('select count(*) as n from sync_queue').get() as { n: number }).n
  assert.equal(
    queued - before.queue,
    seeded.duplicated.length * 2,
    'the repaired reads were not enqueued',
  )

  const indexes = (
    db.prepare("select name from sqlite_master where type = 'index'").all() as {
      name: string
    }[]
  ).map((i) => i.name)
  for (const name of [
    'idx_reads_book_number',
    'idx_reads_status',
    'idx_books_title',
    'idx_books_isbn',
  ]) {
    assert.ok(indexes.includes(name), `${name} is missing`)
  }
})

/** The columns 0002 adds to `books`, left out of "nothing else changed". */
const BOOK_DETAILS = ['description', 'categories', 'preview_url', 'details_checked_at']

function v2Database(): DatabaseSync {
  const { db } = v1Database()
  migrate(db, 1)
  return db
}

function fingerprints(db: DatabaseSync) {
  return {
    books: fingerprint(db, 'books', BOOK_DETAILS),
    reads: fingerprint(db, 'reads'),
    sessions: fingerprint(db, 'sessions'),
    shelves: fingerprint(db, 'shelves'),
    assignments: fingerprint(db, 'book_shelves'),
    notes: fingerprint(db, 'notes'),
    queue: fingerprint(db, 'sync_queue'),
  }
}

/**
 * The control for the next test: the fingerprint must notice one changed value in one book, or
 * "unchanged" below means nothing.
 */
test('the populated fingerprint notices a single changed book', () => {
  const db = v2Database()
  const before = fingerprints(db)
  migrate(db, 2, {
    idx: 2,
    statements: [
      ...statementsOf(journal.entries[2]?.tag ?? ''),
      "UPDATE books SET author = NULL WHERE id = 'bk-1'",
    ],
  })
  assert.notEqual(fingerprints(db).books, before.books)
})

test('0002 applies to a POPULATED database, adds empty book details, and loses nothing', () => {
  const db = v2Database()
  const before = fingerprints(db)

  migrate(db, 2)

  assert.deepEqual(fingerprints(db), before, 'a row changed')
  const filled = db
    .prepare(
      `select count(*) as n from books where ${BOOK_DETAILS.map((c) => `${c} is not null`).join(' or ')}`,
    )
    .get() as { n: number }
  assert.equal(filled.n, 0, 'the migration invented book details')
  const cols = (db.prepare('pragma table_info(books)').all() as { name: string }[]).map(
    (c) => c.name,
  )
  for (const c of BOOK_DETAILS) assert.ok(cols.includes(c), `books.${c} is missing`)
})
