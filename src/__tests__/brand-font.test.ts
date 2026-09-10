/**
 * THE TYPEFACE IS NAMED ONCE, AND EVERY CONSUMER AGREES.
 *
 * The family name used to live in two places that had to match by hand: `font.family` in
 * theme.ts and the expo-font plugin block in app.config.ts. A mismatch renders every
 * string in Roboto, silently — the same silent shape as the week the fonts sat in the
 * config and in no build. Both now read `brand.json`. This test asserts they still do,
 * that every weight the type scale uses has a file behind it, and that the files exist.
 *
 * app.config.ts also throws at evaluation if a font file is missing, which fails
 * `expo prebuild` and `expo run:android` outright. This test is the fast half of that.
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { getConfig } from '@expo/config'

import brand from '../ui/brand.json'
import { font } from '../ui/theme'

interface FontDefinition {
  readonly path: string
  readonly weight: number
}

function expoFontFamilies(): { family: string; definitions: FontDefinition[] }[] {
  const { exp } = getConfig(process.cwd(), { skipSDKVersionRequirement: true })
  const plugin = (exp.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'expo-font')
  assert.ok(Array.isArray(plugin), 'app.config.ts no longer configures expo-font')
  const options = plugin[1] as {
    android?: { fonts?: { fontFamily: string; fontDefinitions: FontDefinition[] }[] }
  }
  return (options.android?.fonts ?? []).map((f) => ({
    family: f.fontFamily,
    definitions: f.fontDefinitions,
  }))
}

test('theme.ts applies the family brand.json names', () => {
  assert.equal(font.family, brand.fontFamily)
})

test('app.config.ts embeds the family brand.json names, and only that family', () => {
  const families = expoFontFamilies()
  assert.deepEqual(
    families.map((f) => f.family),
    [brand.fontFamily],
    'the embedded family and the family components ask for have diverged; text renders in Roboto',
  )
})

test('every weight the type scale uses has an embedded file behind it', () => {
  const embedded = new Set(expoFontFamilies()[0]?.definitions.map((d) => d.weight))
  const used = new Set<number>()
  for (const token of Object.values(font)) {
    if (typeof token === 'object') used.add(Number(token.weight))
  }
  for (const weight of used) {
    assert.ok(
      embedded.has(weight),
      `the type scale uses weight ${weight}, which no embedded file provides`,
    )
  }
})

test('every embedded font file exists on disk', () => {
  for (const d of expoFontFamilies()[0]?.definitions ?? []) {
    assert.ok(existsSync(join(process.cwd(), d.path)), `missing font file: ${d.path}`)
  }
})
