/**
 * FEATURES NEVER IMPORT FROM OTHER FEATURES (06-CONVENTIONS, rule 9).
 *
 * ─── WHY AN ESLINT RULE WAS NOT ENOUGH ───────────────────────────────────────
 *
 * There has been a lint rule for this since Slice 0, and it restricts the pattern
 * `@/features/*​/*`. On 2026-09-19 Slice 7 wrote this, in `features/stats/StatsScreen.tsx`:
 *
 *     import { goalLabel } from '../settings/goalForm'
 *
 * and lint passed. The rule protects one SPELLING of the mistake; a relative path is a
 * different spelling of the same mistake. That is the textual-guard failure mode CLAUDE.md
 * is about, and it has now cost this project a cross-feature import three times — twice
 * during the 2026-09-18 audit and once here.
 *
 * So this resolves every import to a real path and asks which feature it lands in. It does
 * not care how the path was written.
 *
 * ─── WHAT IS ALLOWED ─────────────────────────────────────────────────────────
 *
 * A feature may import from `ui/`, `db/`, `domain/`, `lib/`, and from ITSELF at any depth:
 * `features/stats/components/X.tsx` importing `../yearSummary` is the same feature and fine.
 * Shared business logic goes in `domain/`, shared SQL in `db/`, generic utilities in `lib/`.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { test } from 'node:test'

const FEATURES = join(process.cwd(), 'src', 'features')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Every module specifier a file imports, however it was written. */
function importsOf(source: string): string[] {
  const found: string[] = []
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1] as string)
  }
  return found
}

/** Which feature a path inside `src/features` belongs to, or null. */
function featureOf(absolute: string): string | null {
  const rel = relative(FEATURES, absolute).replace(/\\/g, '/')
  if (rel.startsWith('..') || rel === '') return null
  return rel.split('/')[0] ?? null
}

/**
 * The feature a specifier points at, or null when it points outside `features/`.
 *
 * Both spellings are resolved to an absolute path first, which is the whole point: the alias
 * and the relative path are the same mistake written two ways.
 */
function targetFeature(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith('.')) return featureOf(resolve(dirname(fromFile), specifier))
  if (specifier.startsWith('@/features/')) {
    return featureOf(join(FEATURES, specifier.slice('@/features/'.length)))
  }
  return null
}

function crossFeatureImports(): string[] {
  const offences: string[] = []
  for (const file of walk(FEATURES)) {
    const mine = featureOf(file)
    if (mine === null) continue
    for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
      const theirs = targetFeature(file, specifier)
      if (theirs !== null && theirs !== mine) {
        offences.push(`${relative(process.cwd(), file).replace(/\\/g, '/')} → ${specifier}`)
      }
    }
  }
  return offences.sort()
}

test('no feature imports from another feature, by any spelling', () => {
  assert.deepEqual(
    crossFeatureImports(),
    [],
    'Shared business logic goes in domain/, shared SQL in db/, utilities in lib/:\n  ' +
      crossFeatureImports().join('\n  '),
  )
})

test('the scan is actually reading the features, not an empty directory', () => {
  // A guard that walks nothing passes forever. This is the control for the walk itself.
  const files = walk(FEATURES)
  assert.ok(files.length > 30, `only ${files.length} feature files found`)
  assert.ok(files.some((f) => f.endsWith('StatsScreen.tsx')))
})

/** The positive control: both spellings of the real mistake must be caught. */
test('positive control: both spellings are recognised as cross-feature', () => {
  const statsFile = join(FEATURES, 'stats', 'StatsScreen.tsx')

  // The exact import that lint allowed on 2026-09-19.
  assert.equal(targetFeature(statsFile, '../settings/goalForm'), 'settings')
  // The spelling lint did catch.
  assert.equal(targetFeature(statsFile, '@/features/settings/queries'), 'settings')
  // ...and a deeper one, from a component inside a feature.
  const nested = join(FEATURES, 'stats', 'components', 'YearTotals.tsx')
  assert.equal(targetFeature(nested, '../../settings/goalForm'), 'settings')
})

test('positive control: a feature may still reach its own files and the shared layers', () => {
  const statsFile = join(FEATURES, 'stats', 'StatsScreen.tsx')
  assert.equal(targetFeature(statsFile, './yearSummary'), 'stats')
  assert.equal(targetFeature(statsFile, './components/YearTotals'), 'stats')
  // A component reaching back up into its OWN feature is fine at any depth.
  const nested = join(FEATURES, 'stats', 'components', 'YearTotals.tsx')
  assert.equal(targetFeature(nested, '../yearSummary'), 'stats')
  // The shared layers are not features at all.
  for (const shared of ['@/domain/goal', '@/db/goals', '@/ui/Chip', '@/lib/dates', 'react']) {
    assert.equal(targetFeature(statsFile, shared), null, shared)
  }
})

test('importsOf finds every way a module is named', () => {
  const found = importsOf(`
    import { a } from './a'
    import type { B } from "../b/b"
    const c = await import('@/features/c/c')
    const d = require('./d')
  `)
  assert.deepEqual(found, ['./a', '../b/b', '@/features/c/c', './d'])
})
