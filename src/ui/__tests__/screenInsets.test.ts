/**
 * TAB SCREENS DO NOT PAD FOR THE NAVIGATION BAR; EVERY OTHER SCREEN DOES.
 *
 * `TabBar` pads itself by the system inset. A tab screen that padded again left a ~75 dp empty
 * band above the tab bar, rows cut off above it (found on the phone, Slice 4). A full screen with
 * no tab bar that stopped padding would put its Save button under the navigation bar.
 *
 * Textual, so it carries a control. It reads the real route files: each route under `(tabs)` is
 * followed to the feature file it re-exports.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

const SRC = join(process.cwd(), 'src')

/** `import { X } from '@/features/a/B'` in a route file, to `src/features/a/B.tsx`. */
function featureFileOf(routeSource: string): string | null {
  const match = /from '@\/(features\/[^']+)'/.exec(routeSource)
  return match ? join(SRC, `${match[1]}.tsx`) : null
}

function screenTags(source: string): string[] {
  return [...source.matchAll(/<Screen\b[^>]*>/g)].map((m) => m[0])
}

function problems(
  tabFiles: Record<string, string>,
  otherFiles: Record<string, string>,
): string[] {
  const out: string[] = []
  for (const [name, source] of Object.entries(tabFiles)) {
    const tags = screenTags(source)
    if (tags.length === 0) out.push(`${name}: no <Screen>`)
    for (const tag of tags)
      if (!tag.includes('above="tabBar"'))
        out.push(`${name}: ${tag} pads for the system bar under a tab bar`)
  }
  for (const [name, source] of Object.entries(otherFiles)) {
    for (const tag of screenTags(source))
      if (tag.includes('above="tabBar"')) out.push(`${name}: ${tag} has no tab bar below it`)
  }
  return out
}

describe('screen bottom insets', () => {
  test('every tab screen sits above the tab bar, and nothing else claims to', () => {
    const tabsDir = join(SRC, 'app', '(tabs)')
    const tabFiles: Record<string, string> = {}
    for (const route of readdirSync(tabsDir).filter(
      (f) => f.endsWith('.tsx') && !f.startsWith('_'),
    )) {
      const feature = featureFileOf(readFileSync(join(tabsDir, route), 'utf8'))
      assert.ok(feature, `(tabs)/${route} does not re-export a feature screen`)
      tabFiles[feature] = readFileSync(feature, 'utf8')
    }
    assert.equal(Object.keys(tabFiles).length, 3, 'expected Library, Add and Stats')

    const otherFiles: Record<string, string> = {}
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(path)
        } else if (path.endsWith('.tsx') && !(path in tabFiles)) {
          otherFiles[path] = readFileSync(path, 'utf8')
        }
      }
    }
    walk(join(SRC, 'features'))
    assert.deepEqual(problems(tabFiles, otherFiles), [])
  })

  test('control: a tab screen padding again, and a full screen dropping its padding, are flagged', () => {
    assert.deepEqual(
      problems(
        { tab: '<Screen padded={false}>' },
        { full: '<Screen glow="upper" above="tabBar">' },
      ),
      [
        'tab: <Screen padded={false}> pads for the system bar under a tab bar',
        'full: <Screen glow="upper" above="tabBar"> has no tab bar below it',
      ],
    )
  })
})
