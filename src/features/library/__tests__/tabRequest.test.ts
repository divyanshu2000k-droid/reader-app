/**
 * "START THE NEXT ONE" TWICE STILL OPENS WANT TO READ THE SECOND TIME.
 *
 * The fix that this holds: the request is `tab` plus the caller's timestamp, not `tab` alone.
 * The first test below is the one that goes red without it — the second navigation names the
 * same tab, so the parameter alone compares equal to the request already honoured.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readTabRequest } from '../tabRequest'

const TABS = ['reading', 'want', 'finished', 'dnf'] as const

test('a second request for the tab a previous one named is still a new request', () => {
  const first = readTabRequest({ tab: 'want', at: '1000' }, '', TABS)
  assert.equal(first.tab, 'want')

  // The reader then taps Finished, so the screen is no longer where the request put it.
  // "Start the next one" again, from the same finish flow, naming the same tab.
  const second = readTabRequest({ tab: 'want', at: '2000' }, first.key, TABS)
  assert.equal(second.tab, 'want')
  assert.notEqual(second.key, first.key)
})

test('a re-render with no new navigation leaves the reader on the chip they tapped', () => {
  const request = readTabRequest({ tab: 'want', at: '1000' }, '', TABS)
  // Same parameters, same key: the screen re-rendered, nobody asked for anything.
  const again = readTabRequest({ tab: 'want', at: '1000' }, request.key, TABS)
  assert.equal(again.tab, null)
  assert.equal(again.key, request.key)
})

test('a tab name that does not exist is ignored, not trusted', () => {
  assert.equal(readTabRequest({ tab: 'abandoned', at: '1000' }, '', TABS).tab, null)
  assert.equal(readTabRequest({ tab: '', at: '1000' }, '', TABS).tab, null)
})

test('opening the Library with no request at all asks for nothing', () => {
  const opened = readTabRequest({}, '', TABS)
  assert.equal(opened.tab, null)
  // The first render has seen no request, and '@' is what no parameters spell.
  assert.equal(opened.key, '@')
  assert.equal(readTabRequest({}, opened.key, TABS).tab, null)
})

test('every tab can be requested', () => {
  let seen = ''
  for (const [i, tab] of TABS.entries()) {
    const request = readTabRequest({ tab, at: String(i) }, seen, TABS)
    assert.equal(request.tab, tab)
    seen = request.key
  }
})
