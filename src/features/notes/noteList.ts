/**
 * src/features/notes/noteList.ts
 *
 * THE LIST AND ITS FILTER, from `Notes.dc.html`. Pure, so the counts are asserted rather
 * than counted by eye on whichever book was open.
 *
 * The header says "6 notes · 3 quotes", and those two numbers are of the WHOLE book, not of
 * the filter in force. A count that changes when you tap a filter is not a count of anything
 * the reader asked about, and the filter chips already say which subset is showing.
 */

import type { NoteCounts } from '@/db/noteCounts'
import type { NoteType } from '@/db/schema'

/** All, or one type. `all` is not a `NoteType`, deliberately: it is a view, not a note. */
export type NoteFilter = 'all' | NoteType

export const FILTERS: readonly NoteFilter[] = ['all', 'quote', 'note']

export interface ListedNote {
  readonly id: string
  readonly type: NoteType
  readonly content: string
  readonly page: number | null
  readonly createdAt: number
}

export function matchesFilter(note: { readonly type: NoteType }, filter: NoteFilter): boolean {
  return filter === 'all' || note.type === filter
}

export function filterNotes<T extends { readonly type: NoteType }>(
  notes: readonly T[],
  filter: NoteFilter,
): readonly T[] {
  return filter === 'all' ? notes : notes.filter((n) => n.type === filter)
}

/**
 * The counts of a list already in hand. `db/noteCounts.ts` counts in SQL for a book that is
 * not on screen; this counts rows the list already has, rather than a second query per render.
 */
export function countNotes(notes: readonly { readonly type: NoteType }[]): NoteCounts {
  let quotes = 0
  for (const n of notes) if (n.type === 'quote') quotes += 1
  return { quotes, notes: notes.length - quotes, total: notes.length }
}

/**
 * The label on a filter chip. The counts are on the chips too, so tapping one is a decision
 * the reader can make before they make it: "Quotes 0" is not worth a tap.
 */
export function filterLabel(filter: NoteFilter, counts: NoteCounts): string {
  if (filter === 'all') return `All ${counts.total}`
  if (filter === 'quote') return `Quotes ${counts.quotes}`
  return `Notes ${counts.notes}`
}

/**
 * The row's own line: "QUOTE · P.212" or "NOTE", the page only when there is one.
 * Upper case is the artboard's; a page of null is simply absent, never "P.—".
 */
export function noteBadge(note: {
  readonly type: NoteType
  readonly page: number | null
}): string {
  const kind = note.type === 'quote' ? 'QUOTE' : 'NOTE'
  return note.page === null ? kind : `${kind} · P.${note.page}`
}

/**
 * What the row announces to TalkBack. The badge is typographic shorthand; "QUOTE · P.212"
 * read aloud is not a sentence, so the spoken form is spelled out.
 */
export function noteAnnouncement(
  note: { readonly type: NoteType; readonly page: number | null },
  when: string,
): string {
  const kind = note.type === 'quote' ? 'Quote' : 'Note'
  const page = note.page === null ? '' : `, page ${note.page}`
  return `${kind}${page}, ${when}`
}
