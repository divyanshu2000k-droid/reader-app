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
      // A book added by hand has no source categories to guess from and no choice yet, so
      // it starts as Other and the reader can say otherwise in the same form.
      genre: null,
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
    genre: null,
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

/**
 * THE READER'S GENRE (Slice 7).
 *
 * `books.genre` holds a CHOICE; `books.categories` holds the source's raw data, and
 * `domain/genre.ts` turns that into a guess. The distinction is the point: null means "use
 * our guess and keep improving it", and a value means "leave this alone".
 */
describe('genre', () => {
  const base: StoredBookFields = {
    title: 'Piranesi',
    author: 'Susanna Clarke',
    pageCount: 272,
    totalMinutes: null,
    publisher: null,
    publishedYear: null,
    isbn13: null,
    isbn10: null,
    coverColor: null,
    description: null,
    genre: null,
  }

  test('a book with no chosen genre offers none, rather than an empty string', () => {
    // "" and null would look identical in a picker and mean opposite things: one is a
    // choice the reader made, the other is permission to keep guessing.
    assert.equal(formFromBook(base).genre, null)
  })

  test('a chosen genre round-trips', () => {
    assert.equal(formFromBook({ ...base, genre: 'Poetry' }).genre, 'Poetry')
  })

  test('a genre this build does not recognise falls back to no choice', () => {
    // A row from an older build, or one synced from a newer one. Showing a chip the app
    // cannot explain is worse than showing our own guess.
    assert.equal(formFromBook({ ...base, genre: 'Steampunk' }).genre, null)
    assert.equal(formFromBook({ ...base, genre: '' }).genre, null)
  })
})

/**
 * EVERY EDITABLE FIELD REACHES THE PATCH.
 *
 * `bookPatch` is written field by field on purpose — a loop needs a cast, and a cast is
 * where a wrong column or a wrong type slips through. The price is that a new field has to
 * be added by hand, and on 2026-09-19 `genre` was added to the form, the picker and
 * `fields()` and not to the patch. `isFormDirty` loops over keys, so Save lit up, the screen
 * closed, and nothing was written. Found on a phone.
 *
 * This iterates the form's own keys, so the NEXT field that is forgotten fails here rather
 * than on a device.
 */
describe('nothing editable is dropped on the way to the patch', () => {
  const stored: StoredBookFields = {
    title: 'Piranesi',
    author: 'Susanna Clarke',
    pageCount: 272,
    totalMinutes: null,
    publisher: 'Bloomsbury',
    publishedYear: 2020,
    isbn13: null,
    isbn10: null,
    coverColor: null,
    description: 'A house of statues.',
    genre: null,
  }

  test('a changed genre is in the patch', () => {
    const form = { ...formFromBook(stored), genre: 'Poetry' as const }
    assert.deepEqual(bookPatch(stored, form), { genre: 'Poetry' })
  })

  test('clearing a chosen genre writes null, not nothing', () => {
    // Back to "Work it out". Omitting it from the patch would silently keep the old choice.
    const chosen: StoredBookFields = { ...stored, genre: 'Poetry' }
    const form = { ...formFromBook(chosen), genre: null }
    assert.deepEqual(bookPatch(chosen, form), { genre: null })
  })

  test('every field on the form can change the patch', () => {
    // The guard for the next forgotten field. Each key is altered in turn and must produce
    // a non-empty patch; a field the patch does not know about produces {}.
    const baseline = formFromBook(stored)
    const changes: Partial<Record<keyof BookForm, unknown>> = {
      title: 'Changed',
      author: 'Someone Else',
      shape: 'audio',
      length: '999',
      publisher: 'Another',
      year: '1999',
      isbn: '9781635575637',
      coverColor: '#123456',
      description: 'Different.',
      genre: 'Poetry',
    }
    for (const key of Object.keys(baseline) as (keyof BookForm)[]) {
      assert.ok(key in changes, `${key} is not covered by this test`)
      const form = { ...baseline, [key]: changes[key] } as BookForm
      const patch = bookPatch(stored, form)
      assert.ok(
        Object.keys(patch).length > 0,
        `changing ${key} produced an EMPTY patch — bookPatch does not know about it`,
      )
    }
  })
})
