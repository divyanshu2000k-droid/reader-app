/**
 * AN UNDO THAT FAILS MUST SAY SO, WHERE THE READER IS LOOKING.
 *
 * The undo callback was `() => void`, so a failed restore vanished with its toast. These pin
 * the replacement: an undo in flight cannot be timed out, success removes the toast, and a
 * failure takes the toast's place at the front of the queue.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { canUndo, toastQueue, undoFailureMessage, type QueuedToast } from '../toastQueue'
import { ok, type AppError } from '@/lib/result'

const undo = () => Promise.resolve(ok(undefined))

function start(): readonly QueuedToast[] {
  let q: readonly QueuedToast[] = []
  q = toastQueue(q, { type: 'show', id: 1, message: 'Session deleted', onUndo: undo })
  q = toastQueue(q, { type: 'show', id: 2, message: 'Note deleted', onUndo: undo })
  return q
}

test('a failed undo replaces its own toast, at the front, with what went wrong', () => {
  let q = toastQueue(start(), { type: 'undoStarted', id: 1 })
  q = toastQueue(q, {
    type: 'undoFailed',
    id: 1,
    failureId: 3,
    message: 'Could not restore that.',
  })
  assert.deepEqual(
    q.map((t) => [t.id, t.message, t.onUndo === null]),
    [
      [3, 'Could not restore that.', true],
      [2, 'Note deleted', false],
    ],
  )
})

test('the timer cannot dismiss an undo that is still running', () => {
  let q = toastQueue(start(), { type: 'undoStarted', id: 1 })
  q = toastQueue(q, { type: 'expire', id: 1 })
  assert.equal(q[0]?.id, 1, 'the toast carrying a running undo was timed out')
  assert.equal(q[0]?.undoing, true)
})

test('an ordinary toast still expires, and only that one', () => {
  const q = toastQueue(start(), { type: 'expire', id: 1 })
  assert.deepEqual(
    q.map((t) => t.id),
    [2],
  )
})

test('a successful undo removes its toast', () => {
  let q = toastQueue(start(), { type: 'undoStarted', id: 1 })
  q = toastQueue(q, { type: 'undoSucceeded', id: 1 })
  assert.deepEqual(
    q.map((t) => t.id),
    [2],
  )
})

test('a second tap while the undo runs does not run it again', () => {
  const q = toastQueue(start(), { type: 'undoStarted', id: 1 })
  assert.equal(canUndo(q[0]), false)
  assert.equal(canUndo(q[1]), true)
})

test('a failure for a toast already gone still surfaces, first', () => {
  const q = toastQueue(start(), { type: 'undoFailed', id: 99, failureId: 3, message: 'x' })
  assert.equal(q[0]?.id, 3)
  assert.equal(q.length, 3)
})

test('the failure copy says what happened and what is still safe', () => {
  const failed: AppError = {
    tier: 'recoverable',
    message: 'Could not restore that',
    safe: 'It belongs to a book that is also deleted. Restore the book first.',
  }
  assert.equal(
    undoFailureMessage(failed),
    'Could not restore that. It belongs to a book that is also deleted. Restore the book first.',
  )
})
