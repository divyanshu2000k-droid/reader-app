import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  HttpError,
  TimeoutError,
  failureKind,
  searchStatus,
  type SourceState,
} from '../searchStatus'

const notAsked: SourceState = { kind: 'notAsked' }
const loading: SourceState = { kind: 'loading' }
const done: SourceState = { kind: 'done' }
const offline: SourceState = { kind: 'failed', why: 'offline' }
const down: SourceState = { kind: 'failed', why: 'unavailable' }

/** Exactly what Expo's fetch rejected with, on the phone in airplane mode, 2026-09-14. */
class FetchError extends Error {}
const PHONE_OFFLINE_ERROR = new FetchError(
  'fetch failed: java.net.UnknownHostException: Unable to resolve host "openlibrary.org": No address associated with hostname',
)

describe('why a request failed', () => {
  test('the error the phone threw in airplane mode is offline, not a broken database', () => {
    assert.equal(PHONE_OFFLINE_ERROR.name, 'Error')
    assert.equal(PHONE_OFFLINE_ERROR instanceof TypeError, false)
    assert.equal(failureKind(PHONE_OFFLINE_ERROR), 'offline')
  })

  test('a connection that failed for another reason, with a response, is not offline', () => {
    assert.equal(
      failureKind(new Error('fetch failed: javax.net.ssl.SSLHandshakeException')),
      'unavailable',
    )
  })

  test('no connection is offline; a timeout or a bad status is the database, not the phone', () => {
    assert.equal(failureKind(new TypeError('Network request failed')), 'offline')
    assert.equal(failureKind(new TimeoutError()), 'unavailable')
    assert.equal(failureKind(new HttpError(429)), 'unavailable')
    assert.equal(failureKind(new HttpError(503)), 'unavailable')
    assert.equal(failureKind(new Error('parse')), 'unavailable')
  })
})

describe('what the screen says', () => {
  test('asking both: the spinner names both', () => {
    assert.equal(
      searchStatus(loading, loading, 0).progress,
      'Searching Google Books and Open Library',
    )
  })

  test('without a Google key, only Open Library is named', () => {
    assert.equal(searchStatus(notAsked, loading, 0).progress, 'Searching Open Library')
  })

  test('results from one while the other loads: shown, still checking the other', () => {
    const s = searchStatus(done, loading, 4)
    assert.equal(s.progress, 'Still checking Open Library')
    assert.equal(s.unavailable, false)
    assert.equal(s.partial, null)
  })

  test('one answered and one failed: results, and a line naming the missing one', () => {
    const s = searchStatus(down, done, 3)
    assert.equal(s.unavailable, false)
    assert.equal(s.offline, false)
    assert.equal(s.partial, 'Google Books did not answer, so these are from Open Library only.')
  })

  test('every asked source offline: the banner, not an error; cached results say so', () => {
    const none = searchStatus(offline, offline, 0)
    assert.equal(none.offline, true)
    assert.equal(none.unavailable, false)
    assert.equal(none.fromCache, false)
    const cached = searchStatus(notAsked, offline, 2)
    assert.equal(cached.offline, true)
    assert.equal(cached.fromCache, true)
  })

  test('every asked source answered badly: the recoverable error with Try again', () => {
    const s = searchStatus(down, down, 0)
    assert.equal(s.unavailable, true)
    assert.equal(s.offline, false)
    // A mix of offline and down is not "offline": the phone reached something.
    assert.equal(searchStatus(offline, down, 0).unavailable, true)
  })

  test('nothing asked yet says nothing', () => {
    assert.deepEqual(searchStatus(notAsked, notAsked, 0), {
      progress: null,
      offline: false,
      unavailable: false,
      partial: null,
      fromCache: false,
    })
  })
})
