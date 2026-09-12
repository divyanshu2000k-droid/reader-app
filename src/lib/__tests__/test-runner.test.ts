/**
 * `npm test` RUNS EVERY TEST FILE, ON EVERY SHELL.
 *
 * The script's glob used to be unquoted. On Windows, `cmd` passes it through untouched and
 * Node's own glob expands `**` to any depth, so every file ran. On macOS and Linux, npm
 * runs scripts with `sh`, which expands the glob ITSELF — and without `globstar`, `**`
 * means `*`, one directory. `src/__tests__/` and `src/features/launch/__tests__/` never
 * ran: 44 of 106 tests, reported as a clean pass. The gate order, the recovery policy and
 * the kill switch's safety property were among the silent 62.
 *
 * WHY THIS FILE LIVES HERE, ONE LEVEL UNDER src/. It first lived in `src/__tests__/`,
 * which is exactly the directory the broken glob skips — so under `sh` the guard against
 * the bug would itself never run, and never fail. `src/lib/__tests__/` is reached even by
 * the broken pattern. Do not move it deeper or shallower.
 *
 * Double quotes specifically: `cmd` does not strip single quotes, so `'src/**'` would reach
 * Node with the quotes still on and match nothing on Windows instead.
 */

import assert from 'node:assert/strict'
import { globSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'

const ROOT = process.cwd()

/** The double-quoted glob in a test script, or null if it is not double-quoted. */
function quotedPattern(script: string): string | null {
  return /--test\s+"([^"]+)"/.exec(script)?.[1] ?? null
}

function testPattern(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const script = pkg.scripts.test ?? ''
  const pattern = quotedPattern(script)
  assert.ok(
    pattern,
    `npm test must pass its glob in DOUBLE quotes so no shell expands it: ${script}`,
  )
  return pattern
}

/** The positive control: the check must reject the exact script that shipped the bug. */
test('the quoting check rejects an unquoted or single-quoted glob', () => {
  assert.equal(quotedPattern('tsx --test src/**/__tests__/*.test.ts'), null)
  assert.equal(quotedPattern("tsx --test 'src/**/__tests__/*.test.ts'"), null)
  assert.equal(
    quotedPattern('tsx --test "src/**/__tests__/*.test.ts"'),
    'src/**/__tests__/*.test.ts',
  )
})

function testFilesOnDisk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) testFilesOnDisk(full, out)
    else if (entry.endsWith('.test.ts')) out.push(relative(ROOT, full).replace(/\\/g, '/'))
  }
  return out
}

test('npm test hands its glob to node unexpanded', () => {
  testPattern()
})

/**
 * `test:tz` must list every suite whose answers depend on the zone. `streaks.test.ts` was
 * missing from that list — the one suite holding the DST case and every "11pm on the 31st"
 * boundary — so it only ever ran in whatever zone this machine happens to be in.
 */
test('every timezone-sensitive suite is in the test:tz list', () => {
  const runner = readFileSync(join(ROOT, 'scripts', 'test-tz.js'), 'utf8')
  const listed = new Set([...runner.matchAll(/'([^']+\.test\.ts)'/g)].map((m) => m[1]))
  // What it IMPORTS, not which words it contains: this guard's own source names those
  // functions, and matched itself on its first run.
  const sensitive = testFilesOnDisk(join(ROOT, 'src')).filter((f) => {
    const source = readFileSync(join(ROOT, f), 'utf8')
    return /from '(?:\.\.\/)+(?:dates|stats|streaks|progress)'|from '@\/lib\/dates'/.test(
      source,
    )
  })
  const missing = sensitive.filter((f) => !listed.has(f))
  assert.deepEqual(
    missing,
    [],
    `these suites bucket by local day but never run in three zones:\n${missing.join('\n')}`,
  )
})

test('the pattern node receives matches every test file on disk', () => {
  const matched = new Set(
    globSync(testPattern(), { cwd: ROOT }).map((p) => p.replace(/\\/g, '/')),
  )
  const missing = testFilesOnDisk(join(ROOT, 'src')).filter((f) => !matched.has(f))
  assert.deepEqual(missing, [], `test files npm test would never run:\n${missing.join('\n')}`)
})
