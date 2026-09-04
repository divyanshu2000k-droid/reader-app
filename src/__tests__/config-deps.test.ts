/**
 * CONFIG-NAMED DEPENDENCIES MUST BE INSTALLED.
 *
 * Three packages were missed in Slice 0 in exactly the same way: `babel-preset-expo`,
 * `react-native-worklets` and `expo-system-ui`. All three are named in a config file and
 * imported by no source file, so every "remove unused dependencies" instinct points at
 * them, and `npm install --legacy-peer-deps` — which this project needs because of the
 * expo-router/vaul peer conflict — does not enforce peer dependencies.
 *
 * Their absence is invisible to the compiler, the linter and every other test. The worst
 * of the three, `expo-system-ui`, silently disables light mode, and both themes are a
 * free-tier promise in docs/08-MONETISATION.md.
 *
 * This test reads the config files rather than hardcoding a list, so it keeps working as
 * the config changes.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const ROOT = process.cwd()

function readPackageJson(): {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
} {
  const raw = readFileSync(join(ROOT, 'package.json'), 'utf8')
  return JSON.parse(raw) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
  }
}

function installed(): Set<string> {
  const pkg = readPackageJson()
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ])
}

test('expo-system-ui is installed while userInterfaceStyle is automatic', () => {
  const config = readFileSync(join(ROOT, 'app.config.ts'), 'utf8')
  if (!/userInterfaceStyle:\s*'automatic'/.test(config)) return

  assert.ok(
    installed().has('expo-system-ui'),
    'app.config.ts sets userInterfaceStyle: "automatic", which does nothing without ' +
      'expo-system-ui. Removing it silently disables light mode. Nothing imports the ' +
      'package, so it looks unused - it is not. See DECISIONS.md, 2026-09-04.',
  )
})

test('every package named in app.config.ts plugins is installed', () => {
  const config = readFileSync(join(ROOT, 'app.config.ts'), 'utf8')
  const block = config.match(/plugins:\s*\[([\s\S]*?)\n {2}\]/)
  assert.ok(block?.[1], 'could not find the plugins array in app.config.ts')

  const names = [...block[1].matchAll(/'([a-z0-9@/-]+)'/gi)]
    .map((m) => m[1] as string)
    // Plugin option strings are quoted too; a package name never contains a dot or space.
    .filter((n) => /^[a-z0-9@][a-z0-9@/-]*$/i.test(n) && n.includes('-'))

  const have = installed()
  const missing = names.filter((n) => !have.has(n))

  assert.deepEqual(
    missing,
    [],
    'app.config.ts names config plugins that are not in package.json. A plugin that is ' +
      'not installed is silently skipped at prebuild.',
  )
})

test('every babel preset and plugin is installed', () => {
  const babel = readFileSync(join(ROOT, 'babel.config.js'), 'utf8')
  const have = installed()
  const missing: string[] = []

  // `presets: ['babel-preset-expo']` — a missing preset breaks Metro's transformer with a
  // misleading "Cannot read properties of undefined (reading 'transformFile')".
  for (const m of babel.matchAll(/'(babel-preset-[a-z0-9-]+)'/g)) {
    const name = m[1] as string
    if (!have.has(name)) missing.push(name)
  }

  // `'react-native-worklets/plugin'` — the package is the part before the slash.
  for (const m of babel.matchAll(/'([a-z0-9-]+)\/plugin'/g)) {
    const name = m[1] as string
    if (!have.has(name)) missing.push(name)
  }

  assert.deepEqual(
    missing,
    [],
    'babel.config.js names packages that are not in package.json. Metro fails with an ' +
      'internal error that does not name the real cause; `npx expo export` does.',
  )
})
