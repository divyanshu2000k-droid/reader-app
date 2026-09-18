/**
 * src/features/notes/hooks/useNoteTarget.ts
 *
 * What the editor is editing: a new note for a book, or one that already exists. Both end in
 * the same shape — a book, a context, a baseline form and the draft found on disk — so the
 * editor has one code path.
 *
 * Three states, as on book detail:
 *   - `undefined`, not read yet. Nothing shows for the first 400 ms (SkeletonGate).
 *   - `null`, the note or its book is not here any more, or the route carried neither. It
 *     gets its own screen with a way back.
 *   - a context to draw.
 *
 * **The draft is read HERE, once, with the note.** Reading it later, after the editor had
 * already rendered the saved words, would show the reader their note and then replace it.
 *
 * Loaded ONCE, like the session logger: a form must not reload under the reader's typing, so
 * there is no refocus reload here.
 */

import { useEffect, useState } from 'react'

import { DRAFT_SOURCE, decodeDraft, draftKey, type DraftTarget } from '../noteDraft'
import {
  formFromNote,
  newForm,
  type NoteContext,
  type NoteForm,
  type StoredNote,
} from '../noteForm'
import { getNote, getNoteContext, readDraft, type NoteBook } from '../queries'
import { appError, type AppError } from '@/lib/result'

export interface NoteTargetData {
  readonly book: NoteBook
  readonly context: NoteContext
  /** What is saved right now: an empty form for a new note, the note itself for an edit. */
  readonly baseline: NoteForm
  /** The note being edited, or null for a new one. */
  readonly stored: StoredNote | null
  /** A half-written note found on disk, or null. */
  readonly draft: NoteForm | null
  /** `metadata_cache.source_id` for this editor's draft. Also the form's React key. */
  readonly key: string
}

export interface NoteTargetState {
  readonly loaded: NoteTargetData | null | undefined
  readonly error: AppError | null
}

export function useNoteTarget(target: DraftTarget | null): NoteTargetState {
  const [loaded, setLoaded] = useState<NoteTargetData | null | undefined>(undefined)
  const [error, setError] = useState<AppError | null>(null)

  // The target is rebuilt from route params on every render, so the effect depends on the
  // two strings it is made of rather than on the object, which is new each time.
  const kind = target?.kind ?? null
  const id = target === null ? null : target.kind === 'new' ? target.bookId : target.noteId

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        let found: Loaded | null = null
        if (kind === 'new' && id) found = await loadNew(id)
        else if (kind === 'edit' && id) found = await loadExisting(id)
        if (cancelled) return
        if (found === null || kind === null || id === null) {
          setLoaded(null)
          return
        }
        const key = draftKey(
          kind === 'new' ? { kind: 'new', bookId: id } : { kind: 'edit', noteId: id },
        )
        const payload = await readDraft(DRAFT_SOURCE, key)
        if (cancelled) return
        setLoaded({ ...found, draft: payload === null ? null : decodeDraft(payload), key })
        setError(null)
      } catch (cause) {
        if (cancelled) return
        setError(
          appError('recoverable', 'Could not open this note', {
            safe: 'Nothing was changed. Your notes are still saved.',
            cause,
          }),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [kind, id])

  return { loaded, error }
}

type Loaded = Omit<NoteTargetData, 'draft' | 'key'>

async function loadNew(bookId: string): Promise<Loaded | null> {
  const found = await getNoteContext(bookId)
  if (found === null) return null
  return {
    book: found.book,
    context: found.context,
    baseline: newForm('note', found.context),
    stored: null,
  }
}

async function loadExisting(noteId: string): Promise<Loaded | null> {
  const found = await getNote(noteId)
  if (found === null) return null
  // The page default and whether a page is offered come from the book, exactly as for a new
  // note: an audiobook's note is not offered a page it cannot have, even when editing.
  const context = await getNoteContext(found.book.id)
  if (context === null) return null
  return {
    book: found.book,
    context: context.context,
    baseline: formFromNote(found.note),
    stored: found.note,
  }
}
