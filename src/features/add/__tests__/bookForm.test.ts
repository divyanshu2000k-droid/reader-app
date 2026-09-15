import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  EMPTY_FORM,
  bookPatch,
  checkBookForm,
  firstReadRow,
  formFromBook,
  isFormDirty,
  manualBookRow,
  type BookForm,
  type StoredBookFields,
} from '../bookForm'

const YEAR = 2026
const form = (over: Partial<BookForm> = {}): BookForm => ({
  ...EMPTY_FORM,
  title: 'Letters to a Young Poet',
  ...over,
})

describe('what the form allows', () => {
  test('a title alone is enough', () => {
    assert.equal(checkBookForm(form(), YEAR).canSave, true)
  })

  test('no title, or only spaces, cannot be saved, and needs no error to say so', () => {
    const r = checkBookForm(form({ title: '   ' }), YEAR)
    assert.equal(r.canSave, false)
    assert.deepEqual(r.errors, {})
  })

  test('length is whole and positive, in pages or minutes', () => {
    assert.equal(checkBookForm(form({ length: '96' }), YEAR).canSave, true)
    assert.equal(
      checkBookForm(form({ length: '0' }), YEAR).errors.length,
      'Whole pages, more than 0',
    )
    assert.equal(
      checkBookForm(form({ shape: 'audio', length: '6.5' }), YEAR).errors.length,
      'Whole minutes, more than 0',
    )
    assert.ok(checkBookForm(form({ length: '123456' }), YEAR).errors.length)
  })

  test('a year is four digits, and next year is allowed for a pre-order', () => {
    assert.equal(checkBookForm(form({ year: '2027' }), YEAR).canSave, true)
    assert.ok(checkBookForm(form({ year: '2028' }), YEAR).errors.year)
    assert.ok(checkBookForm(form({ year: '99' }), YEAR).errors.year)
  })

  test('an ISBN must be real: a wrong check digit is refused with a way out', () => {
    assert.equal(checkBookForm(form({ isbn: '978-1-63557-563-7' }), YEAR).canSave, true)
    assert.match(
      checkBookForm(form({ isbn: '9781635575638' }), YEAR).errors.isbn ?? '',
      /leave it empty/,
    )
  })
})

describe('what is written', () => {
  test('a print book: pages, no minutes, manual source, blanks as null', () => {
    const row = manualBookRow(form({ author: ' Rainer Maria Rilke ', length: '96' }), 'b1')
    assert.deepEqual(row, {
      id: 'b1',
      source: 'manual',
      sourceId: null,
      coverUrl: null,
      coverLocalPath: null,
      title: 'Letters to a Young Poet',
      author: 'Rainer Maria Rilke',
      pageCount: 96,
      totalMinutes: null,
      publisher: null,
      publishedYear: null,
      isbn13: null,
      isbn10: null,
      coverColor: null,
      description: null,
    })
  })

  test('an audiobook: minutes, never pages', () => {
    const row = manualBookRow(form({ shape: 'audio', length: '365' }), 'b2')
    assert.equal(row.totalMinutes, 365)
    assert.equal(row.pageCount, null)
  })

  test('an ISBN-10 is kept, and its ISBN-13 derived', () => {
    const row = manualBookRow(form({ isbn: '163557563x' }), 'b3')
    assert.equal(row.isbn10, '163557563X')
    assert.equal(row.isbn13, '9781635575637')
  })

  test('the first read is read 1 on the chosen shelf, with no dates the reader did not choose', () => {
    const read = firstReadRow('r1', 'b1', 'finished')
    assert.equal(read.status, 'finished')
    assert.equal(read.readNumber, 1)
    assert.equal(read.startedAt, null)
    assert.equal(read.finishedAt, null)
  })
})

describe('editing', () => {
  const stored: StoredBookFields = {
    title: 'Piranesi',
    author: 'Susanna Clarke',
    pageCount: 272,
    totalMinutes: null,
    publisher: 'Bloomsbury',
    publishedYear: 2020,
    isbn13: '9781635575637',
    isbn10: null,
    coverColor: null,
    description: 'Piranesi lives in the House.',
  }

  test('an untouched form is an empty patch and not dirty', () => {
    const f = formFromBook(stored)
    assert.deepEqual(bookPatch(stored, f), {})
    assert.equal(isFormDirty(f, f), false)
  })

  test('fixing a wrong page count patches only the page count', () => {
    assert.deepEqual(bookPatch(stored, { ...formFromBook(stored), length: '245' }), {
      pageCount: 245,
    })
  })

  test('switching to an audiobook moves the length to minutes and clears the pages', () => {
    const patch = bookPatch(stored, { ...formFromBook(stored), shape: 'audio', length: '365' })
    assert.deepEqual(patch, { pageCount: null, totalMinutes: 365 })
  })

  test('clearing a field writes null, and a colour choice is a change', () => {
    const patch = bookPatch(stored, {
      ...formFromBook(stored),
      publisher: '',
      coverColor: '#2E2E38',
    })
    assert.deepEqual(patch, { publisher: null, coverColor: '#2E2E38' })
  })

  test('the description is edited like any field, and clearing it writes null', () => {
    assert.deepEqual(
      bookPatch(stored, { ...formFromBook(stored), description: '  My own summary. ' }),
      { description: 'My own summary.' },
    )
    assert.deepEqual(bookPatch(stored, { ...formFromBook(stored), description: '   ' }), {
      description: null,
    })
  })

  test('an audiobook reopens as audio with its minutes', () => {
    const f = formFromBook({ ...stored, pageCount: null, totalMinutes: 365 })
    assert.equal(f.shape, 'audio')
    assert.equal(f.length, '365')
  })

  test('trailing spaces alone do not make the form dirty', () => {
    const f = formFromBook(stored)
    assert.equal(isFormDirty({ ...f, title: 'Piranesi ' }, f), false)
  })
})
