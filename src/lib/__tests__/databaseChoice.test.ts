/**
 * A RELEASE BUILD NEVER OPENS ANYTHING BUT THE READER'S LIBRARY.
 *
 * The sandbox flag used to work in release builds, which would have split a reader's books
 * across two files. See databaseChoice.ts.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { chooseDatabase, DATABASE_FILES } from '../databaseChoice'

test('a release build opens the library whatever flags were exported when it was built', () => {
  for (const devicePass of [false, true]) {
    for (const sandboxDb of [false, true]) {
      assert.equal(
        chooseDatabase(false, { devicePass, sandboxDb }),
        'library',
        `a release build with devicePass=${devicePass} sandboxDb=${sandboxDb} left the library`,
      )
    }
  }
})

test('a development build honours the flags, the device pass first', () => {
  assert.equal(chooseDatabase(true, { devicePass: false, sandboxDb: false }), 'library')
  assert.equal(chooseDatabase(true, { devicePass: false, sandboxDb: true }), 'sandbox')
  assert.equal(chooseDatabase(true, { devicePass: true, sandboxDb: false }), 'devcheck')
  assert.equal(chooseDatabase(true, { devicePass: true, sandboxDb: true }), 'devcheck')
})

test('the three databases are three different files', () => {
  const files = Object.values(DATABASE_FILES)
  assert.equal(new Set(files).size, files.length)
  assert.equal(
    DATABASE_FILES.library,
    'reader.db',
    'renaming the library file would orphan every install',
  )
})

/**
 * The wiring, not just the rule. A pure function nobody calls protects nothing, so config.ts
 * must pass `__DEV__` (never `true`, never a flag) and client.ts must name its file from the
 * choice. Textual, so it carries a control.
 */
function wiresChoice(config: string, client: string): boolean {
  return (
    /chooseDatabase\(\s*__DEV__\s*,/.test(config) &&
    /DATABASE_FILES\[\s*databaseChoice\s*\]/.test(client) &&
    !/'devcheck\.db'|'sandbox\.db'/.test(client)
  )
}

test('the wiring check rejects a build that bypasses the rule', () => {
  assert.equal(
    wiresChoice('chooseDatabase(__DEV__, config)', 'DATABASE_FILES[databaseChoice]'),
    true,
  )
  assert.equal(
    wiresChoice('chooseDatabase(true, config)', 'DATABASE_FILES[databaseChoice]'),
    false,
  )
  assert.equal(
    wiresChoice(
      'chooseDatabase(__DEV__, config)',
      "config.sandboxDb ? 'devcheck.db' : 'reader.db'",
    ),
    false,
  )
})

test('config.ts and client.ts use the rule', () => {
  const root = join(process.cwd(), 'src')
  assert.ok(
    wiresChoice(
      readFileSync(join(root, 'lib', 'config.ts'), 'utf8'),
      readFileSync(join(root, 'db', 'client.ts'), 'utf8'),
    ),
    'config.ts must call chooseDatabase(__DEV__, …) and client.ts must use DATABASE_FILES[databaseChoice]',
  )
})
