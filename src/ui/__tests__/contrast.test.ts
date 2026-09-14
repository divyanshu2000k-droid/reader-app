/**
 * EVERY TEXT COLOUR IS READABLE ON EVERY SURFACE IT IS DRAWN ON, IN BOTH SCHEMES.
 *
 * WCAG 2.x AA: 4.5:1 for text, 3:1 for icons and other graphics. The design sheet's own
 * light-mode values failed it in five places (DECISIONS.md, 2026-09-10), including the
 * gold used for the focused tab label and Undo at 4.26:1. None of it looked broken on a
 * dark-mode phone, which is the silent shape this file exists to catch.
 *
 * Translucent surfaces are composited over the ground first: contrast is only defined
 * between opaque colours.
 *
 * The pairs are the ones the components actually draw. When a component puts a text colour
 * on a new background, add the pair here.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { composite, contrastRatio } from '../color'
import { dark, light, type Palette } from '../theme'

const AA_TEXT = 4.5
const AA_GRAPHIC = 3

type Token = Exclude<keyof Palette, 'glow'>

/** Text colours that appear on the plain surfaces: ground, cards, raised controls. */
const TEXT: readonly Token[] = [
  'text',
  'textSecondary',
  'textMuted',
  'accentInk',
  'danger',
  'success',
]
const SURFACES: readonly Token[] = ['ground', 'surface', 'surfaceRaised']

/** Text on a coloured background, each one a real component. [text, background, where] */
const SPECIAL: readonly (readonly [Token, Token, string])[] = [
  ['onAccent', 'accent', 'primary button label, raised tab icon'],
  ['accentInk', 'accentSurface', 'pill button label: Continue; Session complete’s + stepper'],
  ['text', 'accentSurface', 'a focused field’s value'],
  ['text', 'dangerSurface', 'an errored field’s value, and a refused When on the logger'],
  ['danger', 'dangerSurface', 'danger button label'],
  ['textSecondary', 'dangerSurface', 'an inline error’s safe line'],
  ['ground', 'text', 'a selected chip’s label'],
]

/** Non-text marks: held to 3:1, never used for text (see the source guard below). */
const GRAPHICS: readonly Token[] = ['textFaint']

const schemes = [
  ['dark', dark],
  ['light', light],
] as const

function ratio(p: Palette, fg: Token, bg: Token): number {
  const back = composite(p[bg], p.ground)
  return contrastRatio(composite(p[fg], back), back)
}

test('every text colour clears 4.5:1 on ground, surface and raised surface', () => {
  const failures: string[] = []
  for (const [name, p] of schemes) {
    for (const fg of TEXT) {
      for (const bg of SURFACES) {
        const r = ratio(p, fg, bg)
        if (r < AA_TEXT) failures.push(`${name} ${fg} on ${bg}: ${r.toFixed(2)}:1`)
      }
    }
  }
  assert.deepEqual(failures, [], `below WCAG AA for text:\n${failures.join('\n')}`)
})

test('text on a coloured background clears 4.5:1 wherever a component draws it', () => {
  const failures: string[] = []
  for (const [name, p] of schemes) {
    for (const [fg, bg, where] of SPECIAL) {
      const r = ratio(p, fg, bg)
      if (r < AA_TEXT) failures.push(`${name} ${fg} on ${bg} (${where}): ${r.toFixed(2)}:1`)
    }
  }
  assert.deepEqual(failures, [], `below WCAG AA for text:\n${failures.join('\n')}`)
})

test('non-text marks clear 3:1', () => {
  const failures: string[] = []
  for (const [name, p] of schemes) {
    for (const fg of GRAPHICS) {
      for (const bg of SURFACES) {
        const r = ratio(p, fg, bg)
        if (r < AA_GRAPHIC) failures.push(`${name} ${fg} on ${bg}: ${r.toFixed(2)}:1`)
      }
    }
  }
  assert.deepEqual(failures, [], `below WCAG AA for graphics:\n${failures.join('\n')}`)
})

/**
 * The ratios above only mean something if the faint tokens stay off text. Every use of
 * textFaint or textGhost must be a non-text one: an <Icon>, a backgroundColor, a
 * borderColor, or an SVG `fill={…}` / `stroke={…}` attribute (the empty half of a rating
 * star). A React Native <Text> takes no `fill` or `stroke`, so those cannot be text. A placeholder or a label in either would be unreadable, and this is where
 * it is caught, since no ratio test can see which colour a component chose.
 */
/** True when a line uses a faint token somewhere it could be text. Driven by a control. */
function faintAsText(line: string): boolean {
  if (!/c\.text(Faint|Ghost)\b/.test(line)) return false
  return !/<Icon\b|backgroundColor|borderColor|\b(?:fill|stroke)=\{/.test(line)
}

/**
 * The positive control. This scan is a regex over source text, so it fails in one
 * direction: it stops matching and passes. Renaming the tokens, or moving colours into a
 * variable, would silently retire it. These samples must keep failing it.
 */
test('the faint-token scan still flags a faint colour used as text', () => {
  assert.equal(faintAsText('style={[typeStyle(font.body), { color: c.textMuted }]}'), false)
  assert.equal(faintAsText('style={{ color: c.textFaint }}'), true)
  assert.equal(faintAsText('<Text style={{ color: c.textGhost }}>{label}</Text>'), true)
  assert.equal(faintAsText('<Icon name="book" color={c.textFaint} />'), false)
  assert.equal(faintAsText('style={{ backgroundColor: c.textGhost }}'), false)
  // An SVG fill is not text. The word "fill" elsewhere on a line must not exempt real text.
  assert.equal(faintAsText('<Path d={STAR} fill={c.textGhost} />'), false)
  assert.equal(faintAsText('<Text style={{ color: c.textFaint }}>fill in later</Text>'), true)
})

test('the faint tokens are never used as a text colour', () => {
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        if (entry !== '__tests__') walk(path)
      } else if (path.endsWith('.tsx')) {
        readFileSync(path, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (faintAsText(line)) offenders.push(`${path}:${i + 1}: ${line.trim()}`)
          })
      }
    }
  }
  walk(join(process.cwd(), 'src'))
  assert.deepEqual(
    offenders,
    [],
    `textFaint/textGhost used where it may be text. Use textMuted:\n${offenders.join('\n')}`,
  )
})

test('compositing is what the eye sees', () => {
  assert.equal(composite('rgba(255,255,255,0.5)', '#000000'), '#808080')
  assert.equal(composite('#123456', '#FFFFFF'), '#123456')
  assert.throws(() => composite('gold', '#000000'))
})
