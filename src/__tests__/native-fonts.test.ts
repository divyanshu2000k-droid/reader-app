/**
 * THE NATIVE PROJECT, AND THE APK BUILT FROM IT, CARRY THE FONTS BRAND.JSON NAMES.
 *
 * For a week the typeface, the splash config and the Sentry plugin existed in the config
 * and in no build: `android/` was generated once and `expo run:android` never regenerates
 * it. Nothing failed. Everything typechecked, the config evaluated correctly, the font
 * files existed, and the app rendered in Roboto until someone looked at a real screen.
 *
 * This is the check that would have caught it. It reads what actually landed in the
 * generated project and in the built APK, and compares it with brand.json. A stale
 * `android/` fails here with the instruction to run `npm run prebuild`.
 *
 * Both halves skip, rather than fail, when there is nothing to inspect: a fresh clone has
 * no `android/`, and a project that has not been built has no APK.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { test } from 'node:test'

import brand from '../ui/brand.json'

const ROOT = process.cwd()
const FONT_DIR = join(ROOT, 'android', 'app', 'src', 'main', 'res', 'font')
const APK = join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')

/**
 * expo-font renames `PlusJakartaSans_600SemiBold.ttf` to `plus_jakarta_sans_600semi_bold.ttf`
 * for Android resources. Comparing on letters and digits alone makes the two agree without
 * reimplementing its renaming rule, which would itself be a thing that drifts.
 */
const normalise = (name: string) =>
  name
    .replace(/\.ttf$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const expected = Object.values(brand.fontFiles).map((file) => normalise(basename(file)))

test(
  'the generated android/ project contains every font brand.json names',
  {
    skip: existsSync(join(ROOT, 'android'))
      ? false
      : 'no android/ yet (fresh clone): nothing to inspect',
  },
  () => {
    assert.ok(
      existsSync(FONT_DIR),
      'android/ has no res/font directory. It was generated before the fonts were configured. ' +
        'Run `npm run prebuild`, then `npx expo run:android`.',
    )
    const present = new Set(
      readdirSync(FONT_DIR)
        .filter((f) => f.endsWith('.ttf'))
        .map(normalise),
    )
    const missing = expected.filter((f) => !present.has(f))
    assert.deepEqual(
      missing,
      [],
      `android/ is stale: these fonts are in brand.json but not in the native project. ` +
        'Run `npm run prebuild`, then `npx expo run:android`.',
    )
  },
)

test(
  'the built APK contains every font resource the native project declares',
  { skip: existsSync(APK) ? false : 'no debug APK built yet: nothing to inspect' },
  () => {
    // A zip's central directory stores file names uncompressed, so the resource paths are
    // findable as plain bytes without a zip library.
    const apk = readFileSync(APK)
    const declared = existsSync(FONT_DIR)
      ? readdirSync(FONT_DIR).filter((f) => f.endsWith('.ttf'))
      : []
    assert.ok(declared.length > 0, 'the native project declares no fonts; see the test above')
    const missing = declared.filter((f) => !apk.includes(Buffer.from(`res/font/${f}`)))
    assert.deepEqual(
      missing,
      [],
      'the APK predates the native project: rebuild with `npx expo run:android`.',
    )
  },
)
