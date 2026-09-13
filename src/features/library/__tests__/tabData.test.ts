/**
 * A TAB NEVER SHOWS ANOTHER TAB'S BOOKS.
 *
 * Switching from Reading to Finished used to draw the Reading list under the Finished chip
 * until the new query answered.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { viewForTab, type TabResult } from '../tabData'

const reading: TabResult<string, string> = {
  status: 'reading',
  rows: ['The Overstory'],
  libraryEmpty: false,
}

test('the tab the result belongs to shows it', () => {
  assert.deepEqual(viewForTab(reading, 'reading'), {
    rows: ['The Overstory'],
    libraryEmpty: false,
  })
})

test('another tab reads as not loaded, never as the previous tab’s books', () => {
  assert.deepEqual(viewForTab(reading, 'finished'), { rows: null, libraryEmpty: null })
})

test('nothing loaded yet is not loaded', () => {
  assert.deepEqual(viewForTab(null, 'reading'), { rows: null, libraryEmpty: null })
})

test('an empty tab keeps its own answer about whether the library is empty', () => {
  const dnf: TabResult<string, string> = { status: 'dnf', rows: [], libraryEmpty: false }
  assert.deepEqual(viewForTab(dnf, 'dnf'), { rows: [], libraryEmpty: false })
})
