/**
 * METRO MUST NEVER WATCH GRADLE OUTPUT, AND MUST STILL RESOLVE THE APP.
 *
 * Metro started during a Gradle build crashed on a directory that vanished between its
 * walk and its watch, and once hung without serving a bundle. `metro.config.js` blocks
 * Gradle output. The first two versions of that block list were wrong in ways that looked
 * right: one matched only `/`, so it blocked nothing on Windows; the next went through
 * metro-config's `exclusionList`, which re-escapes `/` into an unterminated character
 * class, so Metro would have thrown on every start. This test caught both, and used to
 * live in a scratch folder. It lives here now, so it cannot quietly stop running.
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { test } from 'node:test'

const requireFromRoot = createRequire(join(process.cwd(), 'package.json'))

interface MetroConfigLike {
  readonly resolver: {
    readonly blockList: RegExp | readonly RegExp[]
    readonly sourceExts: string[]
  }
}

const config = requireFromRoot('./metro.config.js') as MetroConfigLike
const patterns = Array.isArray(config.resolver.blockList)
  ? (config.resolver.blockList as readonly RegExp[])
  : [config.resolver.blockList as RegExp]
const blocked = (path: string) => patterns.some((p) => p.test(path))

const GRADLE_OUTPUT = [
  String.raw`C:\repo\node_modules\expo\android\build\kotlin\compileDebugKotlin\local-state`,
  String.raw`C:\repo\android\app\build\intermediates\assets\debug\a.json`,
  String.raw`C:\repo\android\build\generated\x.java`,
  String.raw`C:\repo\node_modules\react-native-reanimated\android\.cxx\Debug\y.o`,
  String.raw`C:\repo\android\.gradle\8.0\z.bin`,
  '/home/dev/repo/node_modules/expo/android/build/k.bin',
  '/home/dev/repo/android/app/build/outputs/apk/debug/app-debug.apk',
]

const APP_FILES = [
  String.raw`C:\repo\src\db\migrations\0000_init.sql`,
  String.raw`C:\repo\src\app\(tabs)\index.tsx`,
  String.raw`C:\repo\src\features\launch\forceUpdate.ts`,
  String.raw`C:\repo\node_modules\expo-router\build\index.js`,
  String.raw`C:\repo\node_modules\drizzle-orm\build\index.js`,
  String.raw`C:\repo\node_modules\@sentry\react-native\dist\js\index.js`,
  '/home/dev/repo/node_modules/expo-router/build/index.js',
]

test('every Gradle output path is blocked, with either path separator', () => {
  for (const path of GRADLE_OUTPUT) assert.ok(blocked(path), `NOT BLOCKED: ${path}`)
})

test('nothing the app needs is blocked', () => {
  for (const path of APP_FILES)
    assert.ok(!blocked(path), `BLOCKED, and the app needs it: ${path}`)
})

test('the block list is plain RegExps that compile, and .sql is still a source extension', () => {
  for (const p of patterns) assert.ok(p instanceof RegExp)
  assert.ok(
    config.resolver.sourceExts.includes('sql'),
    'drizzle migrations would stop resolving',
  )
})
