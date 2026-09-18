/**
 * EXPORTING ONE BOOK'S NOTES.
 *
 * The guarantee worth asserting: the export contains every note it was given and nothing is
 * dropped. A partial export that looks complete is the failure this replaces.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { exportNotes } from '../noteExport'

const book = { title: 'The Overstory', author: 'Richard Powers' }
const notes = [
  {
    type: 'quote' as const,
    content: 'The best arguments in the world…',
    page: 212,
    when: 'Yesterday',
  },
  { type: 'note' as const, content: 'Nine separate stories.', page: null, when: 'Sunday' },
]

test('every note given is in the text, with its kind, page and date', () => {
  const out = exportNotes(book, notes, 'all')
  assert.ok(out)
  assert.match(out.body, /^The Overstory\nby Richard Powers\n/)
  assert.match(out.body, /Quote, p\.212 — Yesterday\nThe best arguments in the world…/)
  assert.match(out.body, /Note — Sunday\nNine separate stories\./)
  // Nothing dropped: one block per note.
  assert.equal(out.body.split('\n\n').length, notes.length + 1)
})

test('the subject says which subset, because the file outlives the screen', () => {
  assert.equal(exportNotes(book, notes, 'all')?.subject, 'Notes and quotes from The Overstory')
  assert.equal(exportNotes(book, notes, 'quote')?.subject, 'Quotes from The Overstory')
  assert.equal(exportNotes(book, notes, 'note')?.subject, 'Notes from The Overstory')
})

test('a book with no author on file is not exported "by Unknown"', () => {
  const out = exportNotes({ title: 'Godaan', author: null }, notes, 'all')
  assert.match(out?.body ?? '', /^Godaan\n\n/)
})

test('nothing to export is null, so no share sheet opens on an empty string', () => {
  assert.equal(exportNotes(book, [], 'all'), null)
})

test('a large set is exported whole, not truncated', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({
    type: 'note' as const,
    content: `note ${i}`,
    page: i,
    when: 'Today',
  }))
  const out = exportNotes(book, many, 'all')
  assert.ok(out)
  for (const n of many) assert.ok(out.body.includes(n.content), n.content)
})
