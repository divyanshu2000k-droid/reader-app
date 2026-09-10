/**
 * WHEN A BACKUP IS TAKEN, AND WHEN IT IS NOT.
 *
 * Every cold start used to back up the whole database, pending migration or not, and the
 * 3x free-space check that goes with a backup locked readers on full phones out of their
 * library with no update to apply. These pin the rule that replaced it: a backup only when
 * drizzle is actually about to run something, decided by drizzle's own timestamp rule.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { planMigrations } from '../migrationPlan'

const WHENS = [1000, 2000, 3000]

test('a database already at the latest migration has nothing pending', () => {
  assert.deepEqual(planMigrations(WHENS, { count: 3, lastAppliedAt: 3000 }), {
    pending: 0,
    fresh: false,
  })
})

test('an older database has exactly the newer migrations pending', () => {
  assert.deepEqual(planMigrations(WHENS, { count: 1, lastAppliedAt: 1000 }), {
    pending: 2,
    fresh: false,
  })
})

test('a fresh install runs everything and is marked fresh, so no backup is attempted', () => {
  assert.deepEqual(planMigrations(WHENS, { count: 0, lastAppliedAt: null }), {
    pending: 3,
    fresh: true,
  })
})

test('the rule is drizzle’s timestamp rule, not a count', () => {
  // Drizzle applies an entry only when its `when` is LATER than the newest applied row. An
  // entry with an older timestamp is skipped forever on this database, whatever the count
  // says. A plan based on counts would promise a migration drizzle will never run.
  assert.equal(planMigrations([1000, 1500, 3000], { count: 2, lastAppliedAt: 2000 }).pending, 1)
})

/**
 * THE JOURNAL MUST BE STRICTLY INCREASING, and this is a silent-pass guard.
 *
 * Because drizzle only applies entries newer than the last applied one, a migration added
 * with an older `when` than its predecessor (a rebase, a hand edit, two branches) applies
 * on a fresh install and is SKIPPED FOREVER on every existing reader's phone. Nothing fails:
 * the fresh-install test passes, and existing readers silently run code against a schema
 * missing that migration.
 */
test('journal timestamps strictly increase and indexes are contiguous', () => {
  const journal = JSON.parse(
    readFileSync(
      join(process.cwd(), 'src', 'db', 'migrations', 'meta', '_journal.json'),
      'utf8',
    ),
  ) as { entries: { idx: number; when: number; tag: string }[] }

  assert.ok(journal.entries.length > 0, 'the journal is empty')
  journal.entries.forEach((entry, i) => {
    assert.equal(entry.idx, i, `${entry.tag} has idx ${entry.idx}, expected ${i}`)
    const prev = journal.entries[i - 1]
    if (prev) {
      assert.ok(
        entry.when > prev.when,
        `${entry.tag} (when ${entry.when}) is not later than ${prev.tag} (when ${prev.when}): ` +
          'drizzle would skip it forever on every database that already has the earlier one',
      )
    }
  })
})
