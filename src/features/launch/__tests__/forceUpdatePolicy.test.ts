/**
 * THE KILL SWITCH MUST NOT BRICK ANYBODY.
 *
 * The update screen has no dismiss. Every false positive here is a reader locked out of
 * their own library with no recovery short of reinstalling, and they will be locked out
 * at the exact moment something is already going wrong.
 *
 * So the assertions run in the direction the guarantee runs: most of this file is hostile
 * payloads that must NOT block, not happy paths that must. A suite that only proves "a
 * valid block blocks" is testing the easy half — see the silent-pass hazard in CLAUDE.md.
 * Both directions are here, because a kill switch that cannot kill is also a defect.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decide, readPayload } from '../forceUpdatePolicy'
import { compareVersions, isOlderThan } from '../../../lib/version'

const APP = '1.2.3'

/** A coherent flag: retire everything below 1.3.0, and 1.4.0 is what to go and get. */
const VALID = { minimumVersion: '1.3.0', latestVersion: '1.4.0' }

// ─── THE SWITCH ACTUALLY KILLS ───────────────────────────────────────────────
// The half nobody tests, because it means deliberately blocking your own app.

test('a coherent flag naming a newer minimum DOES block this build', () => {
  const result = decide(APP, VALID)
  assert.equal(result.blocked, true, 'the kill switch failed to kill')
  assert.equal(result.blocked && result.requirement.minimumVersion, '1.3.0')
  assert.equal(result.blocked && result.requirement.latestVersion, '1.4.0')
})

test('a build at or above the minimum is never blocked', () => {
  assert.equal(decide(APP, { minimumVersion: '1.2.3', latestVersion: '1.4.0' }).blocked, false)
  assert.equal(decide(APP, { minimumVersion: '1.2.2', latestVersion: '1.4.0' }).blocked, false)
  assert.equal(decide(APP, { minimumVersion: '0.9.9', latestVersion: '1.4.0' }).blocked, false)
})

// ─── THE COMPARISON ──────────────────────────────────────────────────────────

/**
 * The comparison bug that would matter most: string ordering puts '1.10.0' before
 * '1.9.0', so every reader on 1.10 would be told to update to 1.9 — a lockout produced by
 * a typo-free, entirely plausible flag.
 */
test('versions compare numerically, not as strings', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1)
  assert.equal(isOlderThan('1.10.0', '1.9.0'), false)
  assert.equal(
    decide('1.10.0', { minimumVersion: '1.9.0', latestVersion: '1.11.0' }).blocked,
    false,
  )

  assert.equal(compareVersions('2.0.0', '10.0.0'), -1)
  assert.equal(
    decide('2.0.0', { minimumVersion: '10.0.0', latestVersion: '10.1.0' }).blocked,
    true,
  )
})

test('a missing patch segment means zero, not a parse failure', () => {
  assert.equal(compareVersions('1.2', '1.2.0'), 0)
  assert.equal(
    decide('1.2', { minimumVersion: '1.2.0', latestVersion: '1.3.0' }).blocked,
    false,
  )
  assert.equal(decide('1.2', { minimumVersion: '1.2.1', latestVersion: '1.3.0' }).blocked, true)
})

test('a leading v and a pre-release suffix compare on the core version', () => {
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0)
  assert.equal(compareVersions('1.2.3-beta.1', '1.2.3'), 0)
  assert.equal(
    decide('1.2.3-beta.1', { minimumVersion: '1.2.4', latestVersion: '1.3.0' }).blocked,
    true,
  )
})

// ─── THE SELF-CONSISTENCY GUARD ──────────────────────────────────────────────

/**
 * The single most dangerous realistic mistake: one transposed character in
 * `minimumVersion` retires every build that has ever existed, including the one you would
 * ship to fix it. Nothing about that payload is malformed, so shape validation cannot
 * catch it — only the flag disagreeing with itself can.
 */
test('a typo that retires every build is ignored because the flag contradicts itself', () => {
  // '11.0.0' typed for '1.1.0'. The update you are sending people to get (1.4.0) does not
  // itself clear the floor being set, so the flag is incoherent and is ignored.
  const result = decide(APP, { minimumVersion: '11.0.0', latestVersion: '1.4.0' })
  assert.equal(result.blocked, false, 'a single typo locked every reader out')
  assert.match(result.blocked === false ? result.reason : '', /self-inconsistent/)
})

test('a coherent flag still blocks when latest clears its own floor', () => {
  assert.equal(decide(APP, { minimumVersion: '11.0.0', latestVersion: '11.0.0' }).blocked, true)
  assert.equal(decide(APP, { minimumVersion: '11.0.0', latestVersion: '11.2.0' }).blocked, true)
})

test('latestVersion is required, so an old-shaped payload cannot block', () => {
  assert.equal(decide(APP, { minimumVersion: '9.9.9' }).blocked, false)
  assert.equal(decide(APP, { minimumVersion: '9.9.9', latestVersion: '' }).blocked, false)
  assert.equal(decide(APP, { minimumVersion: '9.9.9', latestVersion: 'latest' }).blocked, false)
})

// ─── HOSTILE AND MALFORMED PAYLOADS ──────────────────────────────────────────

/**
 * Every one of these is something a CDN, a typo, a half-finished edit or an attacker
 * could produce. Not one of them may lock a reader out. The HTML bodies are real: they
 * are what a rate-limited or suspended host actually serves.
 */
const MUST_NOT_BLOCK: readonly (readonly [string, unknown])[] = [
  ['null body', null],
  ['undefined body', undefined],
  ['a string', 'minimumVersion: 9.9.9'],
  ['a number', 42],
  ['a boolean', true],
  ['an array', [{ minimumVersion: '9.9.9', latestVersion: '9.9.9' }]],
  ['an empty object', {}],
  ['an HTML error page', '<!doctype html><h1>404 Not Found</h1>'],
  ['a rate-limit page', '<html><body>Rate limit exceeded</body></html>'],
  ['minimumVersion missing', { latestVersion: '9.9.9', message: 'please update' }],
  ['minimumVersion null', { minimumVersion: null, latestVersion: '9.9.9' }],
  ['minimumVersion a number', { minimumVersion: 9, latestVersion: '9.9.9' }],
  ['minimumVersion empty', { minimumVersion: '', latestVersion: '9.9.9' }],
  ['minimumVersion whitespace', { minimumVersion: '   ', latestVersion: '9.9.9' }],
  ['minimumVersion not a version', { minimumVersion: 'latest', latestVersion: '9.9.9' }],
  ['minimumVersion partially numeric', { minimumVersion: '1.x.0', latestVersion: '9.9.9' }],
  ['minimumVersion with too many parts', { minimumVersion: '1.2.3.4', latestVersion: '9.9.9' }],
  ['minimumVersion negative', { minimumVersion: '-1.0.0', latestVersion: '9.9.9' }],
  ['minimumVersion absurdly large', { minimumVersion: '1e999', latestVersion: '9.9.9' }],
  ['minimumVersion an object', { minimumVersion: { gte: '2.0.0' }, latestVersion: '9.9.9' }],
  ['a nested shape from a different schema', { flags: { minimumVersion: '9.9.9' } }],
]

for (const [name, body] of MUST_NOT_BLOCK) {
  test(`a hostile or malformed payload proceeds: ${name}`, () => {
    const result = decide(APP, body)
    assert.equal(result.blocked, false, `${name} BLOCKED THE APP — this locks readers out`)
  })
}

/**
 * Not knowing our own version is exactly the case where we have no business blocking
 * anyone. The tempting '0.0.0' fallback is below every minimum, so it would pin the
 * reader on an undismissable screen forever. See lib/config.ts.
 */
test('an unreadable app version never blocks, however valid the flag', () => {
  const result = decide(null, VALID)
  assert.equal(result.blocked, false)
  assert.match(result.blocked === false ? result.reason : '', /version/i)
})

test('an unparseable app version never blocks', () => {
  assert.equal(decide('not-a-version', VALID).blocked, false)
  assert.equal(decide('', VALID).blocked, false)
})

// ─── THE PAYLOAD READER ──────────────────────────────────────────────────────

test('unknown keys are ignored, so the payload can grow without stranding old builds', () => {
  const result = decide(APP, {
    ...VALID,
    recommendedVersion: '1.5.0',
    platforms: ['android'],
    somethingFromTheFuture: { nested: true },
  })
  assert.equal(result.blocked, true)
})

test('there is no storeUrl in the payload: the destination is derived locally', () => {
  const parsed = readPayload({ ...VALID, storeUrl: 'https://evil.example/phish' })
  assert.ok(parsed)
  assert.equal('storeUrl' in parsed, false, 'a remote payload must not choose the destination')
})

test('a message is carried through, trimmed, and bounded', () => {
  assert.equal(readPayload({ ...VALID, message: '  Sync bug.  ' })?.message, 'Sync bug.')
  assert.equal(readPayload({ ...VALID, message: '   ' })?.message, null)
  assert.equal(readPayload({ ...VALID, message: 7 })?.message, null)
  assert.equal(readPayload({ ...VALID, message: { text: 'x' } })?.message, null)

  // Unbounded copy pushes the only button off a 360px screen that has no other way out.
  const long = readPayload({ ...VALID, message: 'x'.repeat(5000) })?.message
  assert.ok(long && long.length <= 300, `message was ${long?.length} characters`)
})

test('control characters are stripped from the message', () => {
  const message = readPayload({ ...VALID, message: 'line onetwo' })?.message
  assert.ok(message)
  assert.ok(!/[ -]/.test(message), 'control characters reached the screen')
})
