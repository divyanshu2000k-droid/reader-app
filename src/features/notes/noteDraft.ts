/**
 * src/features/notes/noteDraft.ts
 *
 * THE HALF-WRITTEN NOTE. Pure: what a draft is, where it is filed, and when it comes back.
 *
 * Losing a half-written review is a live StoryGraph complaint (01-PRODUCT), so the editor
 * saves what is typed as it is typed. Two decisions are load-bearing:
 *
 * - **A draft is not a note.** It lives in `metadata_cache`, which is local-only and never
 *   syncs (`db/write.ts`), so an abandoned thought never reaches the server, never appears
 *   in the list, and never counts as anything. Writing the real `notes` row on every
 *   keystroke would have done all three.
 * - **A draft equal to what is already saved is not a draft.** Typing a word and deleting it
 *   must leave no trace, or reopening the note offers to restore something identical to what
 *   is there and the reader cannot tell what they are being asked.
 *
 * A malformed payload reads as "no draft" rather than throwing. The cache is a cache; a
 * corrupted one must not be able to stop the editor opening.
 */

import { isDirty, type NoteForm } from './noteForm'
import { DRAFT_SOURCE } from '@/db/localRecords'
import type { NoteType } from '@/db/schema'

// The storage key lives in `db/localRecords.ts` with the timer's, so nothing else has to
// import this feature to know what a draft is filed under.
export { DRAFT_SOURCE }

/** What is being edited: a new note for a book, or an existing note. */
export type DraftTarget =
  | { readonly kind: 'new'; readonly bookId: string }
  | { readonly kind: 'edit'; readonly noteId: string }

/**
 * `metadata_cache.source_id`. A new note's draft is per BOOK, so opening the editor again
 * for the same book finds it; two different books hold two different drafts.
 */
export function draftKey(target: DraftTarget): string {
  return target.kind === 'new' ? `new:${target.bookId}` : `edit:${target.noteId}`
}

const TYPES: readonly NoteType[] = ['quote', 'note']

export function encodeDraft(form: NoteForm): string {
  return JSON.stringify({ type: form.type, content: form.content, page: form.page })
}

/**
 * A stored payload back into a form, or null if it is not one. Every field is checked: this
 * string came off disk and may have been written by an older version of the app.
 */
export function decodeDraft(payload: string): NoteForm | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { type, content, page } = parsed as Record<string, unknown>
  if (typeof content !== 'string' || typeof page !== 'string') return null
  if (typeof type !== 'string' || !(TYPES as readonly string[]).includes(type)) return null
  return { type: type as NoteType, content, page }
}

/**
 * Whether this form is worth keeping as a draft, given what is already saved.
 *
 * `baseline` is an empty form for a new note, or the saved note for an edit. Equal to the
 * baseline means there is nothing unsaved, so the draft is cleared rather than stored.
 */
export function worthKeeping(form: NoteForm, baseline: NoteForm): boolean {
  return isDirty(form, baseline)
}

/**
 * What the editor opens with: the draft when there is one that differs from what is saved,
 * otherwise the saved note (or an empty form).
 *
 * Returns which one it chose, because the screen says so — a note that silently comes back
 * with different words than the reader last saved is worse than one that explains itself.
 */
export function openWith(
  baseline: NoteForm,
  draft: NoteForm | null,
): { readonly form: NoteForm; readonly restored: boolean } {
  if (draft === null || !isDirty(draft, baseline)) return { form: baseline, restored: false }
  return { form: draft, restored: true }
}

/**
 * Where the editor is, for the purpose of the draft. `finished` means the note was saved,
 * deleted, or deliberately discarded, and the draft has already been dealt with.
 */
export type DraftPhase = 'editing' | 'finished'

/**
 * What the draft writer should do on this tick. Pure, because one of its three answers is a
 * bug that would otherwise only appear on a phone:
 *
 * **After the note is saved, a flush must write NOTHING.** The editor saves, clears the
 * draft, and leaves; the screen then unmounts and the writer flushes one last time. Without
 * this, that flush puts the saved note's text back as a draft under `new:<bookId>`, and the
 * next "Add a note" for that book opens holding the previous note's words.
 */
export function draftAction(
  phase: DraftPhase,
  form: NoteForm,
  baseline: NoteForm,
): 'save' | 'clear' | 'none' {
  if (phase === 'finished') return 'none'
  return worthKeeping(form, baseline) ? 'save' : 'clear'
}
