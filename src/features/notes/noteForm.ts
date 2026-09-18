/**
 * src/features/notes/noteForm.ts
 *
 * WHAT A NOTE SAVES, WHAT IT REFUSES, AND WHAT IS ACTUALLY WRITTEN. Pure, so every shape is
 * asserted rather than seen on whichever note happened to be typed.
 *
 * Two rules here are the ones a reader would notice losing:
 *
 * 1. **A note attaches to the BOOK, never to the read** (03-DATA-MODEL). `readId` is written
 *    for provenance only and is never read back for filtering, so a re-read cannot orphan a
 *    quote. Notes are deliberately not a cascade child of `reads` in `db/write.ts`.
 * 2. **Empty is not a note.** Content that is only whitespace cannot be saved, because a
 *    blank row in the list is indistinguishable from a bug and the reader cannot tell which
 *    of two blanks to delete. Backing out of one is covered by the draft, not by saving it.
 *
 * The page is optional everywhere. `notes.page` means a PAGE, so an audiobook — which has no
 * pages, by the one definition in `domain/progressDisplay.ts` — is not offered one rather
 * than being offered a box that stores minutes in a column named `page`. See DECISIONS.md.
 */

import type { NoteType } from '@/db/schema'

/** The same digit budget as a session position: a page number, not an essay. */
export const PAGE_MAX_DIGITS = 5

/**
 * A note's content has no hard limit — a long quote is still a quote — but the column is
 * text the reader typed by hand, and a paste of a whole chapter is far more likely to be an
 * accident than an intention. Refused, with the reason, rather than silently truncated.
 */
export const CONTENT_MAX = 8000

export interface NoteForm {
  readonly type: NoteType
  readonly content: string
  /** As typed. Empty means "no page", which is allowed. */
  readonly page: string
}

/** A note as it is stored, for editing and for deciding what changed. */
export interface StoredNote {
  readonly id: string
  readonly type: NoteType
  readonly content: string
  readonly page: number | null
}

export interface NoteContext {
  readonly bookId: string
  /** The current read, written for provenance. Null when the book has no live read. */
  readonly readId: string | null
  /** Where the reader is, for the page default. Null for an audiobook or a fresh book. */
  readonly currentPage: number | null
  /** False hides the page field entirely: `notes.page` is a page and an audiobook has none. */
  readonly hasPages: boolean
}

export function newForm(type: NoteType, context: NoteContext): NoteForm {
  return {
    type,
    content: '',
    page: context.hasPages && context.currentPage !== null ? String(context.currentPage) : '',
  }
}

export function formFromNote(note: StoredNote): NoteForm {
  return {
    type: note.type,
    content: note.content,
    page: note.page === null ? '' : String(note.page),
  }
}

/** Digits only, so a pasted "p. 212" cannot become a page of NaN. */
function parsePage(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return Number.NaN
  return Number(trimmed)
}

export interface NoteCheck {
  readonly canSave: boolean
  readonly errors: { readonly content?: string; readonly page?: string }
  /** Pointed out, never blocking: the reader knows their book better than we do. */
  readonly hints: readonly string[]
}

export function checkForm(form: NoteForm, context: { pageCount: number | null }): NoteCheck {
  const errors: { content?: string; page?: string } = {}
  const hints: string[] = []

  const content = form.content.trim()
  if (content.length > CONTENT_MAX) {
    errors.content = `That is longer than a note can be. Keep it under ${CONTENT_MAX} characters.`
  }

  const page = parsePage(form.page)
  if (Number.isNaN(page)) {
    errors.page = 'Pages are whole numbers.'
  } else if (page !== null && page <= 0) {
    errors.page = 'Pages start at 1.'
  } else if (page !== null && context.pageCount !== null && page > context.pageCount) {
    // A hint, not an error: page counts from the APIs are frequently wrong, and the
    // reader's copy is the one in their hands (03-DATA-MODEL).
    hints.push(`That is past page ${context.pageCount}, the page count on file.`)
  }

  return {
    // Whitespace alone is not a note. Nothing is refused out loud for it: the Save button
    // is simply not available until there is something to save, which is what an empty
    // editor already looks like.
    canSave: content !== '' && errors.content === undefined && errors.page === undefined,
    errors,
    hints,
  }
}

/** What `writeRow('notes', …)` is given for a new note. */
export function newNoteRow(
  form: NoteForm,
  context: NoteContext,
  id: string,
): {
  id: string
  bookId: string
  readId: string | null
  type: NoteType
  content: string
  page: number | null
  imagePath: null
} {
  const page = parsePage(form.page)
  return {
    id,
    bookId: context.bookId,
    readId: context.readId,
    type: form.type,
    content: form.content.trim(),
    page: page === null || Number.isNaN(page) ? null : page,
    imagePath: null,
  }
}

/**
 * Only what actually changed. An empty patch writes nothing and queues nothing, so opening a
 * note and closing it does not bump `updated_at` or cost a sync row.
 *
 * `readId` is deliberately absent: editing a quote during a second read does not move the
 * quote to that read. It records where it was first written.
 */
export function notePatch(
  stored: StoredNote,
  form: NoteForm,
): { type?: NoteType; content?: string; page?: number | null } {
  const patch: { type?: NoteType; content?: string; page?: number | null } = {}
  if (form.type !== stored.type) patch.type = form.type
  const content = form.content.trim()
  if (content !== stored.content) patch.content = content
  const parsed = parsePage(form.page)
  const page = parsed === null || Number.isNaN(parsed) ? null : parsed
  if (page !== stored.page) patch.page = page
  return patch
}

/** Whether leaving should ask first (ui/useUnsavedGuard.ts). */
export function isDirty(form: NoteForm, baseline: NoteForm): boolean {
  return (
    form.type !== baseline.type ||
    form.content.trim() !== baseline.content.trim() ||
    form.page.trim() !== baseline.page.trim()
  )
}
