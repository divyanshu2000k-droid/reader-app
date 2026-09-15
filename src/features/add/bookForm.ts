/**
 * src/features/add/bookForm.ts
 *
 * WHAT "ADD IT YOURSELF" AND "EDIT DETAILS" ALLOW AND WRITE. Pure, so the rules are asserted.
 *
 * One form for both (04-SCREENS, Journey D): a book added by hand and a book from a search are
 * edited the same way, because bad metadata is the median case (01-PRODUCT, principle 5).
 *
 *   - **Only the title is required.** No author, no length and no cover are all normal.
 *   - **Length is pages for print and minutes for an audiobook**, written to `page_count` or
 *     `total_minutes`, never both: an audiobook is the book with a length in minutes
 *     (`isAudiobook`, domain/progressDisplay.ts). Switching shape clears the other column.
 *   - **An ISBN must be a real one**, checksum included, or two different books could be taken
 *     for one (domain/isbn.ts).
 *   - **The cover is a colour the reader picks, or none** (the colour derived from the title).
 *     A photographed cover is Plus's "custom covers" (08-MONETISATION), not this slice.
 *   - **An edit writes only what changed**, like a session edit.
 */

import type { ReadStatus } from '@/db/schema'
import type { PatchFor, RowFor } from '@/db/write'
import { DESCRIPTION_MAX_LENGTH } from '@/domain/bookDetails'
import { isValidIsbn10, toIsbn13 } from '@/domain/isbn'

export type BookShape = 'print' | 'audio'

/** Where a new book goes. DNF is not offered for a book just added. */
export type AddStatus = Extract<ReadStatus, 'reading' | 'want' | 'finished'>

export const TITLE_MAX = 300
export const LENGTH_MAX_DIGITS = 5

export interface BookForm {
  readonly title: string
  readonly author: string
  readonly shape: BookShape
  /** Pages for print, minutes for audio, as typed. */
  readonly length: string
  readonly publisher: string
  readonly year: string
  readonly isbn: string
  /** A reader-chosen fallback colour, or null to derive it from the title. */
  readonly coverColor: string | null
  /** The summary on book detail. Often filled from the source; always the reader's to change. */
  readonly description: string
}

/** The book columns this form edits, as stored. */
export interface StoredBookFields {
  readonly title: string
  readonly author: string | null
  readonly pageCount: number | null
  readonly totalMinutes: number | null
  readonly publisher: string | null
  readonly publishedYear: number | null
  readonly isbn13: string | null
  readonly isbn10: string | null
  readonly coverColor: string | null
  readonly description: string | null
}

export const EMPTY_FORM: BookForm = {
  title: '',
  author: '',
  shape: 'print',
  length: '',
  publisher: '',
  year: '',
  isbn: '',
  coverColor: null,
  description: '',
}

export function formFromBook(book: StoredBookFields): BookForm {
  const audio = book.totalMinutes !== null
  const length = audio ? book.totalMinutes : book.pageCount
  return {
    title: book.title,
    author: book.author ?? '',
    shape: audio ? 'audio' : 'print',
    length: length === null ? '' : String(length),
    publisher: book.publisher ?? '',
    year: book.publishedYear === null ? '' : String(book.publishedYear),
    isbn: book.isbn13 ?? book.isbn10 ?? '',
    coverColor: book.coverColor,
    description: book.description ?? '',
  }
}

export interface BookFormCheck {
  readonly errors: {
    readonly title?: string
    readonly length?: string
    readonly year?: string
    readonly isbn?: string
    readonly description?: string
  }
  readonly canSave: boolean
}

function text(v: string): string | null {
  const t = v.trim()
  return t.length > 0 ? t : null
}

export function checkBookForm(form: BookForm, currentYear: number): BookFormCheck {
  const errors: {
    title?: string
    length?: string
    year?: string
    isbn?: string
    description?: string
  } = {}
  const title = form.title.trim()
  if (title.length > TITLE_MAX) errors.title = `Up to ${TITLE_MAX} characters`

  const length = form.length.trim()
  if (
    length !== '' &&
    (!/^\d+$/.test(length) || length.length > LENGTH_MAX_DIGITS || Number(length) === 0)
  ) {
    errors.length =
      form.shape === 'print' ? 'Whole pages, more than 0' : 'Whole minutes, more than 0'
  }

  const year = form.year.trim()
  if (
    year !== '' &&
    (!/^\d{4}$/.test(year) || Number(year) < 1000 || Number(year) > currentYear + 1)
  ) {
    errors.year = `A year up to ${currentYear + 1}`
  }

  const isbn = form.isbn.trim()
  if (isbn !== '' && toIsbn13(isbn) === null) {
    errors.isbn = 'That is not a valid ISBN. Check the digits, or leave it empty.'
  }

  if (form.description.trim().length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Up to ${DESCRIPTION_MAX_LENGTH} characters`
  }

  return { errors, canSave: title.length > 0 && Object.keys(errors).length === 0 }
}

/** The stored columns the form means. Only call on a form `checkBookForm` accepts. */
function fields(form: BookForm): StoredBookFields {
  const length = text(form.length)
  const isbn = text(form.isbn)
  const compact = isbn?.replace(/[\s-]/g, '').toUpperCase() ?? null
  return {
    title: form.title.trim(),
    author: text(form.author),
    pageCount: form.shape === 'print' && length !== null ? Number(length) : null,
    totalMinutes: form.shape === 'audio' && length !== null ? Number(length) : null,
    publisher: text(form.publisher),
    publishedYear: text(form.year) === null ? null : Number(form.year.trim()),
    isbn13: toIsbn13(compact),
    isbn10: compact !== null && isValidIsbn10(compact) ? compact : null,
    coverColor: form.coverColor,
    description: text(form.description),
  }
}

/** A book added by hand. */
export function manualBookRow(form: BookForm, id: string): RowFor<'books'> {
  return {
    id,
    source: 'manual',
    sourceId: null,
    coverUrl: null,
    coverLocalPath: null,
    ...fields(form),
  }
}

/** The first read of a new book, on the chosen shelf. Dates stay null: derived from sessions. */
export function firstReadRow(id: string, bookId: string, status: AddStatus): RowFor<'reads'> {
  return {
    id,
    bookId,
    status,
    rating: null,
    review: null,
    isPrivate: 1,
    startedAt: null,
    finishedAt: null,
    readNumber: 1,
  }
}

/** Only what changed. An edit that changes nothing writes and queues nothing. */
export function bookPatch(original: StoredBookFields, form: BookForm): PatchFor<'books'> {
  const next = fields(form)
  // Field by field, not a loop over keys: a loop needs a cast, and a cast is where a column
  // that does not exist, or a value of the wrong type, would slip through.
  const patch: PatchFor<'books'> = {}
  if (next.title !== original.title) patch.title = next.title
  if (next.author !== original.author) patch.author = next.author
  if (next.pageCount !== original.pageCount) patch.pageCount = next.pageCount
  if (next.totalMinutes !== original.totalMinutes) patch.totalMinutes = next.totalMinutes
  if (next.publisher !== original.publisher) patch.publisher = next.publisher
  if (next.publishedYear !== original.publishedYear) patch.publishedYear = next.publishedYear
  if (next.isbn13 !== original.isbn13) patch.isbn13 = next.isbn13
  if (next.isbn10 !== original.isbn10) patch.isbn10 = next.isbn10
  if (next.coverColor !== original.coverColor) patch.coverColor = next.coverColor
  if (next.description !== original.description) patch.description = next.description
  return patch
}

export function isFormDirty(form: BookForm, baseline: BookForm): boolean {
  return (Object.keys(form) as (keyof BookForm)[]).some((k) => {
    const a = form[k]
    const b = baseline[k]
    return typeof a === 'string' && typeof b === 'string' ? a.trim() !== b.trim() : a !== b
  })
}
