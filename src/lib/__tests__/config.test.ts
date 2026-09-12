/**
 * PUBLIC KEYS ARE READ AS LITERAL `process.env.EXPO_PUBLIC_*`, IN ONE FILE.
 *
 * The kill switch could not be switched on: the URL was read from `expo-constants`, which
 * serves the `app.config` embedded in the APK at native build time, not the manifest Metro
 * serves. Setting the key and restarting Metro did nothing, silently, and the app logged
 * "no force-update URL configured" while the manifest plainly held it.
 *
 * Metro inlines `process.env.EXPO_PUBLIC_NAME` at bundle time ONLY as a literal member
 * expression. Destructuring it, or indexing by a variable, is not inlined and is
 * `undefined` on the device while the `.env` file looks perfectly correct.
 *
 * That bug had no check at all until 2026-09-12. This is it.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'

const ROOT = process.cwd()
const CONFIG = 'src/lib/config.ts'

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') sourceFiles(full, out)
    } else if (/\.tsx?$/.test(entry)) {
      out.push(relative(ROOT, full).replace(/\\/g, '/'))
    }
  }
  return out
}

/**
 * Comments stripped, so the guard judges code and not prose. Its first run failed on
 * config.ts's own comment, which spells out `process.env[name]` in order to warn against
 * it — the same way the transaction guard first failed on client.ts's warning.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Every way of reading the environment that Metro does NOT inline. */
function badEnvReads(raw: string): string[] {
  const source = code(raw)
  const bad: string[] = []
  // Destructuring: `const { EXPO_PUBLIC_X } = process.env`
  if (/(?:const|let|var)\s*\{[^}]*\}\s*=\s*process\.env/.test(source)) bad.push('destructured')
  // Dynamic: `process.env[name]`
  if (/process\.env\s*\[/.test(source)) bad.push('indexed')
  // Aliased: `const env = process.env`
  if (/(?:const|let|var)\s+\w+\s*=\s*process\.env\s*(?:;|$)/m.test(source)) bad.push('aliased')
  return bad
}

test('only config.ts reads the environment', () => {
  const offenders = sourceFiles(join(ROOT, 'src'))
    .filter((f) => f !== CONFIG)
    .filter((f) => /process\.env\./.test(code(readFileSync(join(ROOT, f), 'utf8'))))
  assert.deepEqual(
    offenders,
    [],
    'Public keys are read in src/lib/config.ts and nowhere else, so there is one place ' +
      'that knows how they reach the bundle. db/devPass.ts read one directly until 2026-09-12.',
  )
})

test('config.ts reads every key as a literal process.env.EXPO_PUBLIC_* member', () => {
  const source = code(readFileSync(join(ROOT, CONFIG), 'utf8'))
  assert.deepEqual(badEnvReads(source), [])

  const reads = [...source.matchAll(/process\.env\.(\w+)/g)].map((m) => m[1])
  assert.ok(reads.length > 0, 'config.ts reads no environment keys at all')
  for (const key of reads) {
    assert.match(
      key ?? '',
      /^EXPO_PUBLIC_[A-Z0-9_]+$/,
      `${key} is not an EXPO_PUBLIC_* key: only those are inlined and safe to ship`,
    )
  }
})

/** The positive control: the matcher must reject the shapes that caused the bug. */
test('the environment-read check rejects the forms Metro does not inline', () => {
  assert.deepEqual(badEnvReads('const { EXPO_PUBLIC_X } = process.env'), ['destructured'])
  assert.deepEqual(badEnvReads('const v = process.env[name]'), ['indexed'])
  assert.deepEqual(badEnvReads('const env = process.env'), ['aliased'])
  assert.deepEqual(badEnvReads('value(process.env.EXPO_PUBLIC_SENTRY_DSN)'), [])
})

/**
 * And the other half of that bug: the keys must not ALSO live in `app.config.ts`'s `extra`.
 * Two sources that disagree is what made the device and the Metro manifest differ, and
 * `expo-constants` reads the copy frozen into the APK at build time.
 */
test('app.config.ts does not carry public keys in extra', () => {
  const config = readFileSync(join(ROOT, 'app.config.ts'), 'utf8')
  const extra = /\n\s*extra\s*:/.test(config)
  assert.equal(
    extra,
    false,
    'Public keys belong in .env, read through src/lib/config.ts. `extra` is embedded at ' +
      'native build time, so a .env change silently does nothing until a full rebuild.',
  )
})
