/**
 * THE THEME'S DERIVED VALUES.
 *
 * Every accent variant is now computed from brand.json's one hex, and three size tokens
 * are computed from the values they were once typed as the results of. Derivation removes
 * drift and adds a new way to be wrong: the offsets can be fitted badly, or a rebrand can
 * produce a colour nobody can read. These assertions cover both.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import brand from '../brand.json'
import { hexToRgb, shiftHsl, withAlpha } from '../color'
import { accentVariants, dark, font, light, size, space, typeStyle } from '../theme'

/**
 * The design sheet's values for the shipping accent, #F9BE3D. `inkOnLight` is the
 * CORRECTED value: the sheet's original #A4681A failed WCAG AA (DECISIONS.md, 2026-09-10).
 */
const SHEET = {
  light: '#FFD173',
  inkOnLight: '#965F18',
  onAccentDark: '#22190A',
  onAccentLight: '#2A1E08',
  hairlineOnLight: '#C48C1E',
} as const

function assertClose(actual: string, expected: string, label: string) {
  const a = hexToRgb(actual)
  const e = hexToRgb(expected)
  const worst = Math.max(...a.map((v, i) => Math.abs(v - (e[i] ?? 0))))
  // One step per channel: rounding the fitted offsets to one decimal costs no more.
  assert.ok(worst <= 1, `${label}: derived ${actual}, sheet ${expected}, off by ${worst}`)
}

test('every derived variant reproduces the design sheet for the shipping accent', () => {
  const v = accentVariants('#F9BE3D')
  for (const key of Object.keys(SHEET) as (keyof typeof SHEET)[]) {
    assertClose(v[key], SHEET[key], key)
  }
})

test('the palettes are built from brand.json, not from a copy of it', () => {
  assert.equal(dark.accent, brand.accent)
  assert.equal(light.accent, brand.accent)
  assert.equal(dark.accentSurface, withAlpha(brand.accent, 0.13))
  assert.equal(dark.glow.color, hexToRgb(brand.accent).join(','))
  // The rgba strings match what the sheet spelled out by hand.
  assert.equal(withAlpha('#F9BE3D', 0.28), 'rgba(249,190,61,0.28)')
})

test('a rebrand moves every variant: nothing is left behind in the old colour', () => {
  const next = accentVariants('#3D8BF9')
  const old = accentVariants('#F9BE3D')
  for (const key of Object.keys(old) as (keyof typeof old)[]) {
    assert.notEqual(next[key], old[key], `${key} did not move with the accent`)
  }
})

// Derivation cannot promise contrast. That is enforced for every text/background pair,
// derived or not, in contrast.test.ts, which is also what fails a rebrand to an accent
// whose derived colours cannot be read.

test('the colour helper rejects what it cannot parse, and shifts wrap the hue', () => {
  assert.throws(() => hexToRgb('#FFF'))
  assert.throws(() => hexToRgb('gold'))
  assert.equal(shiftHsl('#FF0000', { h: 360 }), '#FF0000')
  assert.equal(shiftHsl('#FF0000', { l: 100 }), '#FFFFFF')
})

test('the computed size tokens hold the relationships they were once typed as', () => {
  assert.equal(size.tabRaised, size.fab + 2 * size.tabRaiseRing)
  assert.equal(size.iconButton + 2 * size.iconButtonHitSlop, size.minTouch)
  assert.equal(space.toastLift, size.tabBar + space.row)
  // And the values the design sheet showed, so a derivation that is consistent but wrong
  // is caught too.
  assert.deepEqual([size.tabRaised, size.iconButtonHitSlop, space.toastLift], [62, 3, 66])
})

/**
 * EVERY PART OF A TYPE TOKEN REACHES THE STYLE.
 *
 * `letterSpacing` was declared on seven tokens and dropped by `typeStyle` for eight slices,
 * so the whole scale's tracking was decoration. It is the same shape as `font.family`, which
 * was declared in this file from the first commit and applied by nothing (CLAUDE.md item 18):
 * a token nothing reads cannot fail loudly, only quietly.
 *
 * Written as "every token that carries one", not as a list, so a token added later is
 * covered by construction rather than by remembering to extend this test.
 */
test('every type token carrying a letterSpacing gets it applied', () => {
  let tracked = 0
  for (const [name, token] of Object.entries(font)) {
    // `font.family` is the one string in here; everything else is a token.
    if (typeof token === 'string') continue
    if (!('letterSpacing' in token)) continue
    tracked += 1
    assert.equal(typeStyle(token).letterSpacing, token.letterSpacing, name)
  }
  assert.ok(tracked >= 7, `expected the scale to track some tokens, found ${tracked}`)
})

test('a token with no letterSpacing does not invent one', () => {
  assert.equal(typeStyle({ size: 13, weight: '500' }).letterSpacing, undefined)
})

test('the family, size, weight and line height still reach the style', () => {
  const style = typeStyle(font.heading)
  assert.equal(style.fontFamily, brand.fontFamily)
  assert.equal(style.fontSize, font.heading.size)
  assert.equal(style.fontWeight, font.heading.weight)
  assert.equal(style.lineHeight, font.heading.lineHeight)
})
