/**
 * JOURNEY A's GATE ORDER.
 *
 * `evaluate()` is the specification written as code, and until now nothing tested it:
 * each gate had been checked once, by hand, on a device. These assertions pin which screen
 * wins when more than one gate has an opinion, which is the part a refactor breaks without
 * anything looking wrong.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { UpdateRequirement } from '../forceUpdatePolicy'
import { evaluate } from '../gateOrder'
import type { OpenSession } from '../queries'
import type { MigrationStatus } from '@/db/migrate'

const BLOCK: UpdateRequirement = {
  minimumVersion: '9.0.0',
  latestVersion: '9.0.0',
  message: null,
}
const SESSION: OpenSession = {
  id: 'se-1',
  occurredAt: 0,
  bookTitle: 'The Overstory',
  bookAuthor: 'Richard Powers',
  coverLocalPath: null,
  coverUrl: null,
  coverColor: null,
}
const DONE: MigrationStatus = { ok: true, state: 'done', version: 2 }
const PENDING: MigrationStatus = { state: 'pending' }
const FAILED: MigrationStatus = {
  ok: false,
  state: 'failed',
  error: 'Could not update the database',
}

test('the ordinary case passes straight through to the library', () => {
  assert.deepEqual(evaluate(null, DONE, null), { gate: 'ready' })
})

test('a retired build wins over every other gate', () => {
  for (const migration of [DONE, PENDING, FAILED]) {
    for (const session of [null, undefined, SESSION]) {
      assert.equal(evaluate(BLOCK, migration, session).gate, 'update')
    }
  }
})

test('while the flag is still being checked, nothing else may show', () => {
  // Not even a failed migration or an open session: a retired build must not glimpse them.
  assert.equal(evaluate(undefined, DONE, null).gate, 'booting')
  assert.equal(evaluate(undefined, FAILED, SESSION).gate, 'booting')
})

test('a failed migration takes over before session recovery is even asked', () => {
  assert.deepEqual(evaluate(null, FAILED, SESSION), {
    gate: 'migrationFailed',
    message: 'Could not update the database',
  })
})

test('a migration still running holds the splash', () => {
  assert.equal(evaluate(null, PENDING, null).gate, 'booting')
  assert.equal(evaluate(null, PENDING, SESSION).gate, 'booting')
})

test('an open session is asked about once the database is ready', () => {
  assert.deepEqual(evaluate(null, DONE, SESSION), { gate: 'recoverSession', session: SESSION })
})

test('the session question is not skipped just because it has not been answered yet', () => {
  assert.equal(evaluate(null, DONE, undefined).gate, 'booting')
})

/**
 * The retry keeps the FAILED status until it resolves, so the notice and its busy button
 * stay up. The regression this pins: the retry used to reset the status to 'pending',
 * which evaluates to 'booting', which renders nothing once the splash has gone — the
 * reader stared at an empty screen for the length of the retry.
 */
test('a retry in progress keeps the failure notice on screen, never a blank', () => {
  const stillFailedDuringRetry: MigrationStatus = FAILED
  assert.equal(evaluate(null, stillFailedDuringRetry, null).gate, 'migrationFailed')
  assert.notEqual(evaluate(null, stillFailedDuringRetry, null).gate, 'booting')
})
