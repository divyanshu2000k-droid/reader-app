/**
 * "Ask about notifications at most once, ever."
 *
 * The regression check for a bug measured on a phone on 2026-09-19: the reader tapped
 * "Not now", and the priming sheet came back on the very next timer, and would have come
 * back on every timer after that.
 *
 * The cause is worth keeping, because it is not a typo — it is a wrong question. The old
 * decision asked Android whether Android would still show its prompt. But "Not now" is
 * DELIBERATELY never passed to Android: the whole design is that the expensive one-shot
 * system prompt is not spent until the reader has been told what it buys them. So after
 * "Not now" the permission is still `undetermined` and `canAskAgain` is still true, and
 * Android's honest answer to "would you still ask?" is yes, forever.
 *
 * Android cannot remember an answer it was never given. Only we can.
 *
 * `primeDecision` is pure so this can run in node. It does NOT prove that `shouldPrime`
 * passes it the stored answer — see `scripts/device/s6_prime_once.py` for that half, and
 * CLAUDE.md item 20 for why the distinction has already cost this project once.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { primeDecision } from '../primeDecision'

const UNASKED = { askedBefore: false, status: 'undetermined', canAskAgain: true } as const

test('a reader who has never been asked is asked', () => {
  assert.equal(primeDecision(UNASKED), true)
})

test('THE BUG: "Not now" is remembered, though Android knows nothing about it', () => {
  // Byte for byte what Android reports after "Not now": it was never asked, so it would
  // still ask. Every field except `askedBefore` says "go ahead".
  assert.equal(
    primeDecision({ askedBefore: true, status: 'undetermined', canAskAgain: true }),
    false,
    'the sheet returned on every new timer for a reader who had already declined',
  )
})

test('an answer already given to Android is not asked for again', () => {
  assert.equal(primeDecision({ ...UNASKED, status: 'granted' }), false)
  assert.equal(primeDecision({ ...UNASKED, status: 'granted', canAskAgain: false }), false)
})

test('a permanent denial is not asked for again either', () => {
  // Android will not show its prompt, so the sheet could only send them to Settings.
  assert.equal(
    primeDecision({ askedBefore: false, status: 'denied', canAskAgain: false }),
    false,
  )
})

test('a denial Android would still ask about is worth explaining first', () => {
  // The one case where the sheet still earns its place: a refusal that can be revisited.
  assert.equal(primeDecision({ askedBefore: false, status: 'denied', canAskAgain: true }), true)
})

test('having asked beats every other input', () => {
  for (const status of ['undetermined', 'denied', 'granted']) {
    for (const canAskAgain of [true, false]) {
      assert.equal(
        primeDecision({ askedBefore: true, status, canAskAgain }),
        false,
        `asked once already, but would have asked again for ${status}/${canAskAgain}`,
      )
    }
  }
})
