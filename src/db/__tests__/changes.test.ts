import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { onDataChanged, onFocused } from '../../ui/stalePolicy'
import { notifyDataChanged, subscribeDataChanges } from '../changes'

describe('the change signal', () => {
  test('every listener hears a change, and an unsubscribed one does not', () => {
    let a = 0
    let b = 0
    const offA = subscribeDataChanges(() => (a += 1))
    const offB = subscribeDataChanges(() => (b += 1))
    notifyDataChanged()
    offA()
    notifyDataChanged()
    offB()
    assert.deepEqual([a, b], [1, 2])
  })

  test('a listener that throws neither escapes nor stops the others', () => {
    let heard = 0
    const offBad = subscribeDataChanges(() => {
      throw new Error('a screen failed to reload')
    })
    const offGood = subscribeDataChanges(() => (heard += 1))
    assert.doesNotThrow(() => notifyDataChanged())
    offBad()
    offGood()
    assert.equal(heard, 1)
  })
})

describe('when a screen re-reads', () => {
  test('focused: now. Not focused: marked stale, read on return. No write: no read', () => {
    assert.equal(onDataChanged(true), 'reload')
    assert.equal(onDataChanged(false), 'markStale')
    assert.equal(onFocused(true), true)
    assert.equal(onFocused(false), false)
  })
})

// Textual, so it carries a control: every public write function notifies.
const WRITERS = ['writeRow', 'writeBatch', 'softDelete', 'restoreRow', 'updateRow']

function silentWriters(source: string): string[] {
  const bodies = source.split(/export async function /).slice(1)
  return WRITERS.filter((name) => {
    const body = bodies.find((b) => b.startsWith(`${name}<`) || b.startsWith(`${name}(`))
    return body === undefined || !body.includes('notifyDataChanged()')
  })
}

describe('write.ts wiring', () => {
  test('every public write function signals the change it committed', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'db', 'write.ts'), 'utf8')
    assert.deepEqual(silentWriters(source), [])
  })

  test('control: a write function without the signal is flagged', () => {
    const bad = `export async function writeRow<K>(t: K) { runInTransaction(() => {}) }
export async function softDelete(t: string) { notifyDataChanged() }`
    assert.deepEqual(silentWriters(bad), ['writeRow', 'writeBatch', 'restoreRow', 'updateRow'])
  })
})
