/**
 * A LIBRARY ROW NEVER CLAIMS PROGRESS IT CANNOT JUSTIFY.
 *
 * The cases here are the common ones, not the edges: a quarter of print books have no page
 * count, audiobooks have no pages at all, and most of a library has never been opened.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { progressDisplay, type RowProgress } from '../progressDisplay'

const base: RowProgress = {
  pageCount: null,
  totalMinutes: null,
  page: null,
  minute: null,
  pagesRead: 0,
  minutesRead: 0,
  unusable: 0,
}

test('a print book with a page count shows a percentage and a bar', () => {
  const d = progressDisplay({ ...base, pageCount: 500, page: 250, pagesRead: 250 })
  assert.equal(d.fraction, 0.5)
  assert.equal(d.label, '50%')
})

test('a print book with NO page count shows pages read and no bar, never 0%', () => {
  const d = progressDisplay({ ...base, pageCount: null, page: 140, pagesRead: 140 })
  assert.equal(d.fraction, null, 'a bar with no total would be a fraction of nothing')
  assert.equal(d.label, '140 pages')
})

test('a book with no sessions says nothing rather than 0%', () => {
  const d = progressDisplay({ ...base, pageCount: 320 })
  assert.deepEqual(d, { fraction: null, label: null, needsAttention: false })
})

test('an audiobook shows time listened, and a bar against its length', () => {
  const d = progressDisplay({
    ...base,
    totalMinutes: 600,
    minute: 192,
    minutesRead: 192,
  })
  assert.equal(d.label, '3h 12m')
  assert.equal(d.fraction, 0.32)
})

test('an audiobook with no recorded length shows time and no bar', () => {
  const d = progressDisplay({ ...base, minute: 90, minutesRead: 90 })
  assert.equal(d.label, '1h 30m')
  assert.equal(d.fraction, null)
})

test('a reader past the supposed last page sees a full bar, not 108%', () => {
  const d = progressDisplay({ ...base, pageCount: 300, page: 324, pagesRead: 324 })
  assert.equal(d.fraction, 1)
  assert.equal(d.label, '100%')
})

test('sessions that cannot be counted are surfaced, not hidden', () => {
  assert.equal(progressDisplay({ ...base, unusable: 2 }).needsAttention, true)
  assert.equal(progressDisplay(base).needsAttention, false)
})

test('a timed print session shows pages, not hours, in the page column', () => {
  // Time read belongs to Stats; the row's job is where the reader is in the book.
  const d = progressDisplay({
    ...base,
    pageCount: 400,
    page: 100,
    pagesRead: 100,
    minutesRead: 75,
  })
  assert.equal(d.label, '25%')
})
