/**
 * A COVER THAT FAILS TO LOAD FALLS BACK, AND NEVER LEAVES A BLANK BOX.
 *
 * `BookCover` used to render its one source and ignore failure, so a cleared local file or an
 * offline URL showed an empty coloured rectangle. Offline is the normal case here.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { coverCandidates, nextCoverSource } from '../coverSource'

test('the local copy is tried before the remote URL', () => {
  assert.deepEqual(coverCandidates('file:///covers/a.jpg', 'https://x/a.jpg'), [
    'file:///covers/a.jpg',
    'https://x/a.jpg',
  ])
})

test('a bare Android path becomes a file URI Image can load', () => {
  assert.deepEqual(coverCandidates('/data/user/0/app/covers/a.jpg', null), [
    'file:///data/user/0/app/covers/a.jpg',
  ])
})

test('a failed local copy falls back to the URL', () => {
  const c = coverCandidates('/covers/a.jpg', 'https://x/a.jpg')
  assert.equal(nextCoverSource(c, new Set(['file:///covers/a.jpg'])), 'https://x/a.jpg')
})

test('when every source has failed, the answer is the initial, not a blank box', () => {
  const c = coverCandidates('/covers/a.jpg', 'https://x/a.jpg')
  assert.equal(nextCoverSource(c, new Set(c)), null)
})

test('no sources at all means the initial', () => {
  assert.deepEqual(coverCandidates(null, '  '), [])
  assert.equal(nextCoverSource([], new Set()), null)
})
