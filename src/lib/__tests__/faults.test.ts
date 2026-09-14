import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'

import { clearFaults, isFaultArmed, setFault, throwIfFault } from '../faults'

afterEach(() => clearFaults())

describe('forced failures', () => {
  test('a release build can never arm one', () => {
    assert.equal(setFault(false, 'sessionSave', true), false)
    assert.equal(isFaultArmed('sessionSave'), false)
    assert.doesNotThrow(() => throwIfFault('sessionSave'))
  })

  test('a development build arms and disarms exactly the named fault', () => {
    assert.equal(setFault(true, 'libraryQuery', true), true)
    assert.equal(isFaultArmed('libraryQuery'), true)
    assert.equal(isFaultArmed('bookDetail'), false)
    assert.throws(() => throwIfFault('libraryQuery'), /Injected failure/)
    setFault(true, 'libraryQuery', false)
    assert.doesNotThrow(() => throwIfFault('libraryQuery'))
  })
})

// A textual guard, so it carries a control: every caller must pass `__DEV__` itself, the
// identifier Metro replaces with `false` in a release bundle.
const CALL = /setFault\(\s*([^,]+),/g

function badCallers(source: string): string[] {
  return [...source.matchAll(CALL)]
    .map((m) => (m[1] ?? '').trim())
    .filter((arg) => arg !== '__DEV__' && arg !== 'isDevelopmentBuild: boolean')
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('arming wiring', () => {
  test('every setFault call in the app passes __DEV__ literally', () => {
    const files = sourceFiles(join(process.cwd(), 'src'))
    const offenders = files.flatMap((f) =>
      badCallers(readFileSync(f, 'utf8')).map((arg) => `${f}: ${arg}`),
    )
    assert.deepEqual(offenders, [])
    const callers = files.filter((f) => /setFault\(\s*__DEV__/.test(readFileSync(f, 'utf8')))
    assert.ok(callers.length > 0, 'nothing arms a fault: the guard is matching nothing')
  })

  test('control: a call passing anything but __DEV__ is flagged', () => {
    assert.deepEqual(badCallers('setFault(true, "sessionSave", on)'), ['true'])
    assert.deepEqual(badCallers('setFault(config.devicePass, name, on)'), ['config.devicePass'])
    assert.deepEqual(badCallers('setFault(__DEV__, name, on)'), [])
  })
})
