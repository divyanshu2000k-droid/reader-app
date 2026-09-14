import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  bookEnd,
  checkForm,
  defaultFormat,
  formFromSession,
  isDirty,
  newForm,
  newSessionRow,
  parseWhole,
  quickAdd,
  sessionPatch,
  sessionSpan,
  switchFormat,
  type CheckContext,
  type SessionForm,
  type StoredSession,
} from '../sessionForm'

const NOW = new Date(2026, 8, 13, 21, 40).getTime()
const TUESDAY = new Date(2026, 8, 8, 21, 40).getTime()

const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({
  now: NOW,
  book: { pageCount: 659, totalMinutes: null },
  others: [],
  editingId: null,
  allowNoPositions: false,
  today: '2026-09-13',
  ...over,
})

const form = (over: Partial<SessionForm> = {}): SessionForm => ({
  format: 'pages',
  from: '184',
  to: '212',
  occurredAt: NOW,
  ...over,
})

describe('parsing a position', () => {
  test('empty is null, digits are a number, anything else is invalid, never a guess', () => {
    assert.equal(parseWhole(''), null)
    assert.equal(parseWhole('  '), null)
    assert.equal(parseWhole('212'), 212)
    assert.equal(parseWhole(' 0 '), 0)
    assert.equal(parseWhole('12a'), 'invalid')
    assert.equal(parseWhole('-3'), 'invalid')
    assert.equal(parseWhole('2.5'), 'invalid')
    assert.equal(parseWhole('123456'), 'invalid')
  })
})

describe('a new session', () => {
  test('starts from where the reader is, with no end, now', () => {
    const f = newForm('pages', { pages: 184, minutes: null }, NOW)
    assert.deepEqual(f, { format: 'pages', from: '184', to: '', occurredAt: NOW })
  })

  test('a first session starts from 0: positions are boundaries, page 0 is before page 1', () => {
    assert.equal(newForm('pages', { pages: null, minutes: null }, NOW).from, '0')
  })

  test('keeps the format of the latest session, then the book shape', () => {
    assert.equal(defaultFormat('minutes', false), 'minutes')
    assert.equal(defaultFormat(null, true), 'minutes')
    assert.equal(defaultFormat(null, false), 'pages')
  })

  test('switching format restarts from the other position; an edit keeps its numbers', () => {
    const positions = { pages: 184, minutes: 95 }
    const typed = form({ to: '200' })
    assert.deepEqual(switchFormat(typed, 'minutes', positions), {
      ...typed,
      format: 'minutes',
      from: '95',
      to: '',
    })
    assert.deepEqual(switchFormat(typed, 'minutes', null), { ...typed, format: 'minutes' })
  })

  test('quick add builds on the end already typed, else on the start', () => {
    assert.equal(quickAdd(form({ to: '' }), 10).to, '194')
    assert.equal(quickAdd(form({ to: '212' }), 25).to, '237')
    assert.equal(quickAdd(form({ from: '', to: '' }), 50).to, '50')
  })

  test('Finished is the book end for its format, or nothing when the length is unknown', () => {
    assert.equal(bookEnd('pages', { pageCount: 659, totalMinutes: null }), 659)
    assert.equal(bookEnd('pages', { pageCount: null, totalMinutes: 600 }), null)
    assert.equal(bookEnd('minutes', { pageCount: 659, totalMinutes: 600 }), 600)
    assert.equal(bookEnd('pages', { pageCount: 0, totalMinutes: null }), null)
  })

  test('the span is to minus from, boundaries, so 184 → 212 is 28', () => {
    assert.equal(sessionSpan(form()), 28)
    assert.equal(sessionSpan(form({ from: '0', to: '10' })), 10)
    assert.equal(sessionSpan(form({ to: '184' })), null)
    assert.equal(sessionSpan(form({ to: '' })), null)
  })
})

describe('what Save allows', () => {
  test('a forwards session for now saves', () => {
    const r = checkForm(form(), ctx())
    assert.equal(r.canSave, true)
    assert.deepEqual(r.errors, {})
  })

  test('a session for last Tuesday saves: any day that has happened', () => {
    assert.equal(checkForm(form({ occurredAt: TUESDAY }), ctx()).canSave, true)
  })

  test('the future is refused, with a minute of slack for the clock', () => {
    assert.equal(checkForm(form({ occurredAt: NOW + 30_000 }), ctx()).canSave, true)
    const r = checkForm(form({ occurredAt: NOW + 5 * 60_000 }), ctx())
    assert.equal(r.canSave, false)
    assert.ok(r.errors.when)
  })

  test('an empty end waits without an error: every new session starts that way', () => {
    const r = checkForm(form({ to: '' }), ctx())
    assert.equal(r.canSave, false)
    assert.deepEqual(r.errors, {})
  })

  test('backwards or zero-length is refused, and says after which page', () => {
    const back = checkForm(form({ to: '120' }), ctx())
    assert.equal(back.canSave, false)
    assert.equal(back.errors.to, 'Must be after page 184')
    assert.equal(checkForm(form({ to: '184' }), ctx()).canSave, false)
    assert.equal(
      checkForm(form({ format: 'minutes', to: '10' }), ctx()).errors.to,
      'Must be after minute 184',
    )
  })

  test('typing that is not a whole number is refused on the field it is in', () => {
    const r = checkForm(form({ from: 'x', to: '2.5' }), ctx())
    assert.equal(r.canSave, false)
    assert.equal(r.errors.from, 'Whole numbers only')
    assert.equal(r.errors.to, 'Whole numbers only')
  })

  test('an end with no start asks where it started', () => {
    const r = checkForm(form({ from: '' }), ctx())
    assert.equal(r.canSave, false)
    assert.ok(r.errors.from)
  })

  test('no positions at all saves only for a session whose time already counts', () => {
    const empty = form({ from: '', to: '' })
    assert.equal(checkForm(empty, ctx()).canSave, false)
    assert.equal(checkForm(empty, ctx({ allowNoPositions: true })).canSave, true)
    // A half-filled edit of a recovered session is still refused.
    assert.equal(
      checkForm(form({ from: '10', to: '' }), ctx({ allowNoPositions: true })).canSave,
      false,
    )
  })

  test('past the book length saves, and says the page count may be wrong', () => {
    const r = checkForm(form({ to: '700' }), ctx())
    assert.equal(r.canSave, true)
    assert.equal(r.hints.length, 1)
    assert.match(r.hints[0] ?? '', /659 pages/)
  })

  test('overlapping another session saves, and names that session so it can be found', () => {
    const other = {
      id: 's1',
      format: 'pages' as const,
      fromPosition: 200,
      toPosition: 250,
      occurredAt: TUESDAY,
    }
    const r = checkForm(form(), ctx({ others: [other] }))
    assert.equal(r.canSave, true)
    assert.equal(r.hints.length, 1)
    assert.match(r.hints[0] ?? '', /200 → 250 .*Tue 8 Sep/)
  })

  test('touching boundaries is not an overlap: 184 → 212 then 212 → 240 chain exactly', () => {
    const next = {
      id: 's2',
      format: 'pages' as const,
      fromPosition: 212,
      toPosition: 240,
      occurredAt: NOW,
    }
    const prev = {
      id: 's0',
      format: 'pages' as const,
      fromPosition: 150,
      toPosition: 184,
      occurredAt: NOW,
    }
    assert.deepEqual(checkForm(form(), ctx({ others: [next, prev] })).hints, [])
  })

  test('the session being edited never overlaps itself, nor one in another format', () => {
    const self = {
      id: 'me',
      format: 'pages' as const,
      fromPosition: 184,
      toPosition: 212,
      occurredAt: NOW,
    }
    const audio = {
      id: 'a',
      format: 'minutes' as const,
      fromPosition: 100,
      toPosition: 300,
      occurredAt: NOW,
    }
    assert.deepEqual(
      checkForm(form(), ctx({ others: [self, audio], editingId: 'me' })).hints,
      [],
    )
  })
})

describe('what is written', () => {
  test('a new row carries the form, and no local_day: the write path derives it', () => {
    const row = newSessionRow(form({ occurredAt: TUESDAY }), { id: 'id1', readId: 'r1' })
    assert.deepEqual(row, {
      id: 'id1',
      readId: 'r1',
      occurredAt: TUESDAY,
      format: 'pages',
      fromPosition: 184,
      toPosition: 212,
      durationSeconds: null,
      isTimed: 0,
      note: null,
    })
    assert.equal('localDay' in row, false)
  })

  const stored: StoredSession = {
    id: 's',
    format: 'pages',
    fromPosition: 184,
    toPosition: 212,
    occurredAt: NOW,
    durationSeconds: null,
  }

  test('an edit that changes nothing is an empty patch, so nothing is queued', () => {
    assert.deepEqual(sessionPatch(stored, formFromSession(stored)), {})
    assert.equal(isDirty(formFromSession(stored), formFromSession(stored)), false)
  })

  test('moving the date to last Tuesday patches the instant and nothing else', () => {
    const edited = { ...formFromSession(stored), occurredAt: TUESDAY }
    assert.deepEqual(sessionPatch(stored, edited), { occurredAt: TUESDAY })
    assert.equal(isDirty(edited, formFromSession(stored)), true)
  })

  test('changing positions patches only them; clearing one writes null', () => {
    assert.deepEqual(sessionPatch(stored, form({ to: '230' })), { toPosition: 230 })
    const recovered: StoredSession = {
      ...stored,
      fromPosition: null,
      toPosition: null,
      durationSeconds: 2460,
    }
    assert.deepEqual(sessionPatch(recovered, form()), { fromPosition: 184, toPosition: 212 })
    assert.deepEqual(sessionPatch(stored, form({ from: '', to: '' })), {
      fromPosition: null,
      toPosition: null,
    })
  })

  test('whitespace alone does not make a form dirty', () => {
    const base = formFromSession(stored)
    assert.equal(isDirty({ ...base, to: ' 212 ' }, base), false)
  })
})
