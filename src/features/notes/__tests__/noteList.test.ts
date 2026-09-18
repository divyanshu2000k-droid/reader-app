/**
 * THE LIST, ITS FILTER AND ITS COUNTS.
 *
 * The count in the header is of the whole book and does not move when a filter is tapped.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { countNotes, filterLabel, filterNotes, noteAnnouncement, noteBadge } from '../noteList'

const notes = [
  { id: '1', type: 'quote' as const, page: 212 },
  { id: '2', type: 'note' as const, page: 188 },
  { id: '3', type: 'quote' as const, page: null },
]

test('All shows everything, and each filter shows only its own type', () => {
  assert.deepEqual(filterNotes(notes, 'all'), notes)
  assert.deepEqual(
    filterNotes(notes, 'quote').map((n) => n.id),
    ['1', '3'],
  )
  assert.deepEqual(
    filterNotes(notes, 'note').map((n) => n.id),
    ['2'],
  )
})

test('All is the same array, not a copy: nothing is re-created on every render', () => {
  assert.equal(filterNotes(notes, 'all'), notes)
})

test('the counts are of the book, and add up', () => {
  assert.deepEqual(countNotes(notes), { quotes: 2, notes: 1, total: 3 })
  assert.deepEqual(countNotes([]), { quotes: 0, notes: 0, total: 0 })
})

test('a chip carries its own count, so an empty filter is not worth a tap', () => {
  const counts = { quotes: 2, notes: 1, total: 3 }
  assert.equal(filterLabel('all', counts), 'All 3')
  assert.equal(filterLabel('quote', counts), 'Quotes 2')
  assert.equal(filterLabel('note', counts), 'Notes 1')
})

test('a row without a page shows no page, never an empty one', () => {
  assert.equal(noteBadge({ type: 'quote', page: 212 }), 'QUOTE · P.212')
  assert.equal(noteBadge({ type: 'quote', page: null }), 'QUOTE')
  assert.equal(noteBadge({ type: 'note', page: 188 }), 'NOTE · P.188')
})

test('what TalkBack says is a sentence, not the typographic shorthand', () => {
  assert.equal(
    noteAnnouncement({ type: 'quote', page: 212 }, 'Yesterday'),
    'Quote, page 212, Yesterday',
  )
  assert.equal(noteAnnouncement({ type: 'note', page: null }, 'Today'), 'Note, Today')
})
