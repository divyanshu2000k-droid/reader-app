/**
 * EVERY ROW OF RECENTLY DELETED SAYS WHICH THING IT IS.
 *
 * The question a row has to answer is "is this the one I want back?". A book has a title and
 * a cover; a session and a note have neither, so each must carry its book.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { NOTE_PREVIEW, deletedLine } from '../deletedLine'
import type { DeletedItem } from '../queries'

const formatted = { removed: 'yesterday', when: 'Tue 8 Sep, 9:40 pm' }

const book: DeletedItem = {
  kind: 'book',
  id: 'b1',
  title: 'The Overstory',
  author: 'Richard Powers',
  coverUrl: null,
  coverLocalPath: null,
  coverColor: null,
  deletedAt: 1,
}

const session: DeletedItem = {
  kind: 'session',
  id: 's1',
  bookTitle: 'The Overstory',
  occurredAt: 1,
  format: 'pages',
  fromPosition: 184,
  toPosition: 212,
  durationSeconds: null,
  deletedAt: 1,
}

const note: DeletedItem = {
  kind: 'note',
  id: 'n1',
  bookTitle: 'The Overstory',
  type: 'quote',
  content: 'The best arguments in the world will not change a person’s mind.',
  page: 212,
  deletedAt: 1,
}

test('a book is its title, and when it was removed', () => {
  assert.deepEqual(deletedLine(book, formatted), {
    title: 'The Overstory',
    detail: 'Removed yesterday',
  })
})

test('a session is what it was, and carries its book and its date', () => {
  const line = deletedLine(session, formatted)
  assert.equal(line.title, '28 pages · 184 → 212')
  assert.equal(line.detail, 'The Overstory · Tue 8 Sep, 9:40 pm · deleted yesterday')
})

test('a note is its opening words, and carries its kind, page and book', () => {
  const line = deletedLine(note, formatted)
  assert.match(line.title, /^The best arguments/)
  assert.equal(line.detail, 'Quote, p.212 from The Overstory · deleted yesterday')
})

test('a note with no page does not claim one', () => {
  const line = deletedLine({ ...note, type: 'note', page: null }, formatted)
  assert.equal(line.detail, 'Note from The Overstory · deleted yesterday')
})

test('a long note is cut, and says it was cut', () => {
  const long = 'word '.repeat(200)
  const line = deletedLine({ ...note, content: long }, formatted)
  assert.ok(line.title.length <= NOTE_PREVIEW + 1, `${line.title.length} characters on one row`)
  assert.ok(line.title.endsWith('…'), 'a cut note must not read as a note that ends there')
})

test('a note written across several lines is flattened onto one row', () => {
  const line = deletedLine({ ...note, content: 'first\n\n  second   line' }, formatted)
  assert.equal(line.title, 'first second line')
})

test('a short note is not cut, and gains no ellipsis', () => {
  const line = deletedLine({ ...note, content: 'short' }, formatted)
  assert.equal(line.title, 'short')
})
