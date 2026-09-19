/**
 * THE TIMER'S RUNTIME LIVES IN ONE MODULE, AND NOT IN ANY SCREEN OR HOOK.
 *
 * This is the guard for `docs/10-AUDIT-2026-09-18.md` finding 1, and it exists because the
 * fix for that finding was itself incomplete — the same bug, in the one listener the fix
 * left behind.
 *
 * The finding: `useTimer` owned the tick, the heartbeat, the notification refresh and the
 * notification's action listener, and `useTimer` lives in the timer screen. Leaving the
 * screen unmounted the hook, so a session stayed open while everything that MAINTAINS a
 * running session stopped. Measured: a session open ~3 minutes offered 1 minute, the bound
 * frozen at the moment the screen was left.
 *
 * The reintroduction, found on a phone on 2026-09-19: the rewrite moved four things into
 * `timerService.ts` and left the fifth, an `AppState` listener that beats just before the app
 * is backgrounded. Being in the hook meant it only fired for a reader still LOOKING at the
 * timer — and reading with a timer running is precisely leaving that screen. Nothing threw,
 * nothing typechecked wrong, and the service's own tick hid it: the heartbeat still ran, so
 * only the final beat before a kill was lost.
 *
 * So the rule is not "move this listener", it is **nothing in `features/timer` may own a
 * subscription or a timer except `timerService.ts`**. That is what this asserts.
 *
 * This is a TEXTUAL guard — a regex over source text — so it protects exactly the spellings
 * below and carries a positive control, per CLAUDE.md.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'

const TIMER = join(process.cwd(), 'src', 'features', 'timer')

/** The one module allowed to own the runtime. It is not a component and never unmounts. */
const OWNER = 'src/features/timer/timerService.ts'

interface Rule {
  readonly what: string
  readonly pattern: RegExp
}

/**
 * Every way we have actually used to own something that outlives a render.
 *
 * `setInterval` is the tick. `AppState.addEventListener` is the beat before a kill.
 * `addNotificationResponseReceivedListener` is the notification's Pause and Finish buttons,
 * which stop working the moment nobody is listening.
 */
const RUNTIME: readonly Rule[] = [
  { what: 'a ticker', pattern: /\bsetInterval\s*\(/ },
  { what: 'a timeout that outlives a render', pattern: /\bsetTimeout\s*\(/ },
  { what: 'an AppState listener', pattern: /\bAppState\s*\.\s*addEventListener\s*\(/ },
  { what: 'a notification action listener', pattern: /\bonTimerAction\s*\(/ },
  {
    // The spelling used before the notification moved to the native foreground service.
    // Kept so a revert to `expo-notifications` is caught rather than silently allowed.
    what: 'an expo-notifications response listener',
    pattern: /\baddNotificationResponseReceivedListener\s*\(/,
  },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** Strip comments, so the prose above — which names every one of these — is not a hit. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function offences(source: string): string[] {
  const body = code(source)
  return RUNTIME.filter((rule) => rule.pattern.test(body)).map((rule) => rule.what)
}

test('only timerService owns the timer runtime', () => {
  const files = walk(TIMER)
  assert.ok(files.length > 3, 'the timer feature should have several files')

  const found: string[] = []
  for (const file of files) {
    const rel = relative(process.cwd(), file).replace(/\\/g, '/')
    if (rel === OWNER) continue
    for (const what of offences(readFileSync(file, 'utf8'))) {
      found.push(`${rel} owns ${what}`)
    }
  }
  assert.deepEqual(
    found,
    [],
    'The timer runtime must live in timerService.ts, which outlives the screen. ' +
      'A screen or hook that owns it stops the moment the reader navigates away, ' +
      'while the session stays open:\n  ' +
      found.join('\n  '),
  )
})

/**
 * The subset the service must actually have.
 *
 * Not all of `RUNTIME`: `setTimeout` is forbidden in a component because a timer that
 * outlives a render belongs to the service, but the service has no need of one today. This
 * list is what the service DOES own, and losing any of it means either the runtime moved
 * back into a component or the spelling changed underneath this guard.
 */
const OWNED = RUNTIME.filter(
  (rule) =>
    rule.what !== 'a timeout that outlives a render' &&
    rule.what !== 'an expo-notifications response listener',
)

test('timerService really does own all of it', () => {
  const owner = code(readFileSync(join(process.cwd(), OWNER), 'utf8'))
  assert.equal(OWNED.length, 3)
  for (const rule of OWNED) {
    assert.ok(
      rule.pattern.test(owner),
      `timerService no longer has ${rule.what}. Either it moved back into a component — ` +
        'which is the bug this guards — or the spelling changed and this guard now ' +
        'protects nothing. Both need a person, not a green tick.',
    )
  }
})

/**
 * The positive control.
 *
 * A regex guard fails silently when the code it looks for is renamed: it stops matching and
 * reports success. So the matcher is fed the exact shape of the bug, and prose that merely
 * mentions it, every run.
 */
test('positive control: the guard flags the code that shipped the bug', () => {
  const theBug = `
    export function useTimer() {
      useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
          if (next !== 'active') beatNow()
        })
        return () => sub.remove()
      }, [])
    }
  `
  assert.deepEqual(offences(theBug), ['an AppState listener'])

  const theOriginalBug = `
    useEffect(() => {
      const id = setInterval(() => setSeconds(elapsed()), 1000)
      return () => clearInterval(id)
    }, [])
  `
  assert.deepEqual(offences(theOriginalBug), ['a ticker'])

  const theNotificationBug = `
    useEffect(() => {
      const sub = onTimerAction((a) => { if (a === 'timer-pause') pause() })
      return () => sub.remove()
    }, [])
  `
  assert.deepEqual(offences(theNotificationBug), ['a notification action listener'])
})

test('positive control: prose about the bug is not the bug', () => {
  const prose = `
    /**
     * It used to own an AppState.addEventListener('change') and a setInterval, and
     * onTimerAction and addNotificationResponseReceivedListener too. In the service now.
     */
    export function useTimer() {
      return useSyncExternalStore(subscribeTimer, getTimerSnapshot, getTimerSnapshot)
    }
  `
  assert.deepEqual(offences(prose), [])
})
