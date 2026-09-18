/**
 * THE HALF-WRITTEN NOTE COMES BACK, AND AN UNTOUCHED ONE LEAVES NO TRACE.
 *
 * "Backing out of a half written note does not lose it" is this slice's done-when
 * (05-BUILD-PLAN). The direction that matters is the restore: a draft that differs from what
 * is saved must be what the editor opens with, and it must say that it did.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  decodeDraft,
  draftAction,
  draftKey,
  encodeDraft,
  openWith,
  worthKeeping,
} from '../noteDraft'
import type { NoteForm } from '../noteForm'

const empty: NoteForm = { type: 'note', content: '', page: '212' }
const typed: NoteForm = { type: 'note', content: 'half a thou', page: '212' }

test('a new note drafts per book, and an edit per note', () => {
  assert.equal(draftKey({ kind: 'new', bookId: 'book-1' }), 'new:book-1')
  assert.equal(draftKey({ kind: 'edit', noteId: 'note-9' }), 'edit:note-9')
  // Two books do not share one draft.
  assert.notEqual(
    draftKey({ kind: 'new', bookId: 'a' }),
    draftKey({ kind: 'new', bookId: 'b' }),
  )
})

test('what was typed survives the round trip through storage', () => {
  assert.deepEqual(decodeDraft(encodeDraft(typed)), typed)
})

test('the half-written note is what the editor opens with, and it says so', () => {
  assert.deepEqual(openWith(empty, typed), { form: typed, restored: true })
})

test('no draft opens the saved note untouched', () => {
  assert.deepEqual(openWith(empty, null), { form: empty, restored: false })
})

test('a draft identical to what is saved is not offered as a restore', () => {
  assert.deepEqual(openWith(typed, { ...typed }), { form: typed, restored: false })
  // Whitespace alone is not a difference, so it is not a restore either.
  assert.equal(openWith(typed, { ...typed, content: ' half a thou ' }).restored, false)
})

test('an edit whose draft differs from the SAVED note restores the draft, not the note', () => {
  const saved: NoteForm = { type: 'quote', content: 'the trees', page: '212' }
  const draft: NoteForm = { type: 'quote', content: 'the trees and the', page: '212' }
  assert.deepEqual(openWith(saved, draft), { form: draft, restored: true })
})

test('typing a word and deleting it leaves nothing to store', () => {
  assert.equal(worthKeeping(empty, empty), false)
  assert.equal(worthKeeping({ ...empty, content: '   ' }, empty), false)
  assert.equal(worthKeeping(typed, empty), true)
})

// ─── A CACHE THAT CANNOT STOP THE EDITOR OPENING ─────────────────────────────

test('a payload that is not a draft reads as no draft, and never throws', () => {
  for (const bad of ['', 'null', '{', '[]', '"a string"', '{"content":"x"}', '17']) {
    assert.equal(decodeDraft(bad), null, bad)
  }
})

test('a draft from an older version with a type we no longer have is discarded', () => {
  assert.equal(decodeDraft('{"type":"highlight","content":"x","page":""}'), null)
})

test('a draft whose fields are the wrong type is discarded, not coerced', () => {
  assert.equal(decodeDraft('{"type":"note","content":"x","page":212}'), null)
  assert.equal(decodeDraft('{"type":"note","content":null,"page":""}'), null)
})

// ─── WHAT THE WRITER DOES, INCLUDING AFTER THE NOTE IS SAVED ─────────────────

test('typing saves a draft; reverting clears it', () => {
  assert.equal(draftAction('editing', typed, empty), 'save')
  assert.equal(draftAction('editing', empty, empty), 'clear')
})

test('AFTER THE NOTE IS SAVED, the last flush writes nothing', () => {
  // The editor saved, cleared the draft and left. The screen then unmounts and flushes.
  // Writing here would put the saved note back as a draft, and the next "Add a note" for
  // this book would open holding the previous note's words.
  assert.equal(draftAction('finished', typed, empty), 'none')
})

test('a discarded note leaves nothing behind either', () => {
  assert.equal(draftAction('finished', empty, empty), 'none')
})
