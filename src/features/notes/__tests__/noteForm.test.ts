/**
 * WHAT A NOTE SAVES AND WHAT IT REFUSES.
 *
 * The two assertions that carry the slice's promises: a note is written against the BOOK and
 * never against the read (so a re-read cannot orphan it), and a patch carries only what
 * actually changed (so opening a note and closing it writes nothing).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CONTENT_MAX,
  checkForm,
  formFromNote,
  isDirty,
  newForm,
  newNoteRow,
  notePatch,
  type NoteForm,
  type StoredNote,
} from '../noteForm'

const context = {
  bookId: 'book-1',
  readId: 'read-2',
  currentPage: 212,
  hasPages: true,
}

/**
 * An audiobook that ALSO has pages logged: `totalMinutes` set makes it an audiobook by the
 * one definition (domain/progressDisplay.ts) while `currentPage` is real. The page must still
 * not be offered — and a `currentPage: null` fixture would pass either way, which is how the
 * first version of this test let the rule be deleted without going red.
 */
const noPages = { ...context, currentPage: 212, hasPages: false }

test('a new note starts on the page the reader has reached', () => {
  assert.deepEqual(newForm('quote', context), { type: 'quote', content: '', page: '212' })
})

test('a book with no pages is not offered one, and gets no page by default', () => {
  assert.deepEqual(newForm('note', noPages), { type: 'note', content: '', page: '' })
})

test('a book on page nothing yet starts with an empty page, not zero', () => {
  assert.equal(newForm('note', { ...context, currentPage: null }).page, '')
})

// ─── WHAT IS WRITTEN ─────────────────────────────────────────────────────────

test('the row is written against the book, with the read only for provenance', () => {
  const form: NoteForm = { type: 'quote', content: '  the trees  ', page: '212' }
  assert.deepEqual(newNoteRow(form, context, 'note-9'), {
    id: 'note-9',
    bookId: 'book-1',
    readId: 'read-2',
    type: 'quote',
    content: 'the trees',
    page: 212,
    imagePath: null,
  })
})

test('a book with no live read still takes a note', () => {
  const form: NoteForm = { type: 'note', content: 'a thought', page: '' }
  const row = newNoteRow(form, { ...context, readId: null }, 'note-1')
  assert.equal(row.readId, null)
  assert.equal(row.bookId, 'book-1')
  assert.equal(row.page, null)
})

test('a page that is not digits is written as no page, never as NaN', () => {
  const row = newNoteRow({ type: 'note', content: 'x', page: 'p. 212' }, context, 'n')
  assert.equal(row.page, null)
})

/**
 * The inputs where "digits only" and `Number()` disagree. `notes.page` is an INTEGER column
 * and the field is pasteable, so `Number('212.5')` would store a fractional page and
 * `Number('1e3')` would store 1000 for three typed characters. A test that only ever tried
 * 'p. 212' passed against both spellings.
 */
test('a pasted page that only LOOKS numeric is refused, not coerced', () => {
  for (const page of ['1e3', '0x10', '212.5', '+5', '-5', '2 12', '١٢']) {
    assert.equal(
      checkForm({ type: 'note', content: 'x', page }, book).errors.page,
      'Pages are whole numbers.',
      page,
    )
    assert.equal(
      newNoteRow({ type: 'note', content: 'x', page }, context, 'n').page,
      null,
      page,
    )
  }
})

test('a page with spaces around it is still that page', () => {
  assert.equal(
    newNoteRow({ type: 'note', content: 'x', page: ' 212 ' }, context, 'n').page,
    212,
  )
  assert.equal(
    checkForm({ type: 'note', content: 'x', page: ' 212 ' }, book).errors.page,
    undefined,
  )
})

// ─── WHAT CHANGED ────────────────────────────────────────────────────────────

const stored: StoredNote = { id: 'note-1', type: 'quote', content: 'the trees', page: 212 }

test('opening a note and closing it writes nothing', () => {
  assert.deepEqual(notePatch(stored, formFromNote(stored)), {})
})

test('only the field that changed is written', () => {
  assert.deepEqual(notePatch(stored, { ...formFromNote(stored), content: 'the roots' }), {
    content: 'the roots',
  })
  assert.deepEqual(notePatch(stored, { ...formFromNote(stored), type: 'note' }), {
    type: 'note',
  })
})

test('clearing the page writes null, which clears the column', () => {
  assert.deepEqual(notePatch(stored, { ...formFromNote(stored), page: '' }), { page: null })
})

test('editing during a later read does not move the note to that read', () => {
  const patch = notePatch(stored, { ...formFromNote(stored), content: 'changed' })
  assert.equal('readId' in patch, false)
})

test('whitespace either side of the content is not a change', () => {
  assert.deepEqual(notePatch(stored, { ...formFromNote(stored), content: '  the trees ' }), {})
})

// ─── WHAT IS REFUSED ─────────────────────────────────────────────────────────

const book = { pageCount: 502 }

test('an empty note cannot be saved, and says nothing about it', () => {
  const check = checkForm({ type: 'note', content: '   ', page: '' }, book)
  assert.equal(check.canSave, false)
  assert.deepEqual(check.errors, {})
})

test('a note with words can be saved', () => {
  assert.equal(checkForm({ type: 'note', content: 'x', page: '' }, book).canSave, true)
})

test('a page of zero or a page that is not a number is refused, with the reason', () => {
  assert.equal(
    checkForm({ type: 'note', content: 'x', page: '0' }, book).errors.page,
    'Pages start at 1.',
  )
  assert.equal(
    checkForm({ type: 'note', content: 'x', page: '21a' }, book).errors.page,
    'Pages are whole numbers.',
  )
  assert.equal(checkForm({ type: 'note', content: 'x', page: '0' }, book).canSave, false)
})

test('a page past the page count is pointed out, not refused: page counts are often wrong', () => {
  const check = checkForm({ type: 'note', content: 'x', page: '600' }, book)
  assert.equal(check.canSave, true)
  assert.deepEqual(check.hints, ['That is past page 502, the page count on file.'])
})

test('a book with no page count on file points nothing out', () => {
  assert.deepEqual(
    checkForm({ type: 'note', content: 'x', page: '600' }, { pageCount: null }).hints,
    [],
  )
})

test('an enormous paste is refused rather than silently truncated', () => {
  const check = checkForm(
    { type: 'note', content: 'x'.repeat(CONTENT_MAX + 1), page: '' },
    book,
  )
  assert.equal(check.canSave, false)
  assert.match(check.errors.content ?? '', /longer than a note can be/)
  assert.equal(
    checkForm({ type: 'note', content: 'x'.repeat(CONTENT_MAX), page: '' }, book).canSave,
    true,
  )
})

// ─── LEAVING ─────────────────────────────────────────────────────────────────

test('leaving asks only when something was actually typed', () => {
  const baseline = newForm('note', context)
  assert.equal(isDirty(baseline, baseline), false)
  assert.equal(isDirty({ ...baseline, content: '  ' }, baseline), false)
  assert.equal(isDirty({ ...baseline, content: 'a' }, baseline), true)
  assert.equal(isDirty({ ...baseline, type: 'quote' }, baseline), true)
  assert.equal(isDirty({ ...baseline, page: '5' }, baseline), true)
})
