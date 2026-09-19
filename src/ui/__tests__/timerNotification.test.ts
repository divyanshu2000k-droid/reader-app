/**
 * THE NOTIFICATION'S BUTTON IDENTIFIERS EXIST TWICE, AND MUST MATCH.
 *
 * `ReadingService.kt` builds the `PendingIntent`s and puts an action string in each; the
 * TypeScript compares the string it receives against `TIMER_ACTION`. Kotlin cannot import
 * TypeScript, so the strings are duplicated — and a rename on either side produces buttons
 * that are present, tappable, and do nothing at all.
 *
 * That is not a hypothetical. **Finish was wired to nothing for a full day**: the button was
 * built, photographed in the expanded shade, and written up as working, while the listener
 * handled `pause` and `resume` and fell through on `finish`. Nothing threw. The only signal
 * would have been a reader tapping Finish and watching their session carry on.
 *
 * This is a TEXTUAL guard over a Kotlin file, so it carries a positive control.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { HEARTBEAT_MS } from '@/domain/timerRun'
import { TIMER_ACTION, TIMER_CHANNEL, noticeText } from '../timerNotice'

const KOTLIN = join(
  process.cwd(),
  'modules/reading-service/android/src/main/java/expo/modules/readingservice/ReadingService.kt',
)

/** `const val NAME = "value"` out of the Kotlin, as a map. */
function kotlinConstants(source: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of source.matchAll(/const val ([A-Z_]+)\s*=\s*"([^"]*)"/g)) {
    out[match[1] as string] = match[2] as string
  }
  return out
}

/** `const val NAME = 30000L` out of the Kotlin. */
function kotlinNumbers(source: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const match of source.matchAll(/const val ([A-Z_]+)\s*=\s*(\d+)L?/g)) {
    out[match[1] as string] = Number(match[2])
  }
  return out
}

/**
 * The heartbeat interval exists in both languages, and they have to agree.
 *
 * The service's `HandlerThread` writes the beat that actually carries the recovery bound —
 * the JavaScript one stops the moment the app is backgrounded — while `heartbeatDue` in
 * `domain/timerRun.ts` decides when the JavaScript one is owed. Two intervals that drift
 * apart would make the two heartbeats disagree about how stale is stale, silently.
 */
test('the heartbeat interval matches on both sides', () => {
  const numbers = kotlinNumbers(readFileSync(KOTLIN, 'utf8'))
  assert.equal(numbers['HEARTBEAT_MS'], HEARTBEAT_MS)
})

/**
 * The positive control for the NUMBER extractor, and it is not decoration.
 *
 * This extractor shipped for about four minutes with a literal backspace character in the
 * regex, from a stray escape that left a 0x08 byte after `L?`. It matched
 * nothing, returned an empty map, and the assertion above caught it only because it compares
 * against a known value rather than against "whatever we found". A guard that reads a file
 * and finds nothing must fail, not pass.
 */
test('positive control: the number extractor reads what it claims to', () => {
  const found = kotlinNumbers(
    ['  const val HEARTBEAT_MS = 30000L', '  const val OTHER = 7'].join('\n'),
  )
  assert.deepEqual(found, { HEARTBEAT_MS: 30000, OTHER: 7 })
  assert.deepEqual(kotlinNumbers('const val NOT_A_NUMBER = "thirty"'), {})
})

test('every button identifier matches the Kotlin that sends it', () => {
  const constants = kotlinConstants(readFileSync(KOTLIN, 'utf8'))
  assert.equal(constants['ACTION_PAUSE'], TIMER_ACTION.pause)
  assert.equal(constants['ACTION_RESUME'], TIMER_ACTION.resume)
  assert.equal(
    constants['ACTION_FINISH'],
    TIMER_ACTION.finish,
    'Finish is the one that was already broken once, silently, for a day',
  )
})

test('the channel matches too', () => {
  const constants = kotlinConstants(readFileSync(KOTLIN, 'utf8'))
  assert.equal(constants['CHANNEL_ID'], TIMER_CHANNEL)
})

test('the Kotlin still declares all four, so this guard is reading something', () => {
  const constants = kotlinConstants(readFileSync(KOTLIN, 'utf8'))
  for (const name of ['ACTION_PAUSE', 'ACTION_RESUME', 'ACTION_FINISH', 'CHANNEL_ID']) {
    assert.ok(
      typeof constants[name] === 'string',
      `${name} is gone from ReadingService.kt. Either the service was rewritten, or this ` +
        'extractor has stopped matching and is now asserting nothing.',
    )
  }
})

/** The positive control: the extractor must actually notice a mismatch. */
test('positive control: a renamed Kotlin constant is caught', () => {
  const renamed = kotlinConstants(`
    const val CHANNEL_ID = "reading-timer"
    const val ACTION_PAUSE = "timer_pause"
    const val ACTION_FINISH = "timer-finish"
  `)
  assert.equal(renamed['ACTION_PAUSE'], 'timer_pause')
  assert.notEqual(
    renamed['ACTION_PAUSE'],
    TIMER_ACTION.pause,
    'an underscore for a hyphen is exactly the kind of drift this exists to catch',
  )
})

test('the notification says "so far", never a live-looking clock', () => {
  const running = noticeText({ title: 'Winter Letters', seconds: 724, running: true })
  assert.equal(running.title, 'Reading')
  assert.equal(running.body, 'Winter Letters · 12:04 so far')

  const paused = noticeText({ title: 'Winter Letters', seconds: 724, running: false })
  assert.equal(paused.title, 'Paused')
  assert.equal(paused.body, 'Winter Letters · paused at 12:04')
})
