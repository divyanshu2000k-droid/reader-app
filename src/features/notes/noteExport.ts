/**
 * src/features/notes/noteExport.ts
 *
 * EXPORTING ONE BOOK'S NOTES, as plain text. Pure: the text is built here and handed to
 * Android's share sheet by the screen.
 *
 * **It exports what is on screen.** A filter is in force and visible, so exporting the whole
 * book while "Quotes 3" is selected would hand the reader something they did not ask for and
 * could not see. The header line says which, so the file is self-describing once it is out
 * of the app.
 *
 * Plain text and the system share sheet, rather than a file: it needs no new native
 * dependency, works with the network off, and reaches mail, notes apps and messaging alike.
 * The size limit is Android's, not ours, and an over-long share FAILS LOUDLY in the share
 * sheet rather than being silently truncated here — a half-exported set of notes that looks
 * complete is the failure worth avoiding. See DECISIONS.md.
 */

import type { NoteFilter } from './noteList'
import type { NoteType } from '@/db/schema'

export interface ExportNote {
  readonly type: NoteType
  readonly content: string
  readonly page: number | null
  /** Already formatted for a human, by `lib/dates.ts`. Nothing here parses a date. */
  readonly when: string
}

export interface ExportBook {
  readonly title: string
  readonly author: string | null
}

function heading(note: ExportNote): string {
  const kind = note.type === 'quote' ? 'Quote' : 'Note'
  const page = note.page === null ? '' : `, p.${note.page}`
  return `${kind}${page} — ${note.when}`
}

function subject(book: ExportBook, filter: NoteFilter): string {
  const what = filter === 'quote' ? 'Quotes' : filter === 'note' ? 'Notes' : 'Notes and quotes'
  return `${what} from ${book.title}`
}

export interface ExportText {
  /** The share sheet's subject, used by mail clients and ignored by everything else. */
  readonly subject: string
  readonly body: string
}

/**
 * Null when there is nothing to export. The caller must not open a share sheet on an empty
 * string: Android shows a chooser for it, the reader picks an app, and nothing arrives.
 */
export function exportNotes(
  book: ExportBook,
  notes: readonly ExportNote[],
  filter: NoteFilter,
): ExportText | null {
  if (notes.length === 0) return null
  const head = book.author === null ? book.title : `${book.title}\nby ${book.author}`
  const blocks = notes.map((n) => `${heading(n)}\n${n.content.trim()}`)
  return { subject: subject(book, filter), body: `${head}\n\n${blocks.join('\n\n')}\n` }
}
