/**
 * src/lib/version.ts
 *
 * Semantic version comparison, and nothing else.
 *
 * A dependency is not worth it for this: `semver` is 30kB to answer one question, and
 * the app's versions are plain `major.minor.patch` strings it produces itself.
 *
 * The bug this file exists to prevent is comparing versions as STRINGS, where
 * `'1.10.0' < '1.9.0'` is true and every reader on 1.10 gets told to update to 1.9.
 * That is a wrong comparison in the one place a wrong answer locks people out of the app.
 */

/** A parsed version, or null when the input is not one. */
function parse(version: string): readonly number[] | null {
  if (typeof version !== 'string') return null
  // Tolerate a leading `v` and pre-release/build suffixes: `1.2.3-beta.1` compares as
  // 1.2.3. Precedence between pre-releases is not something this app needs, and guessing
  // at it would be a way to get the comparison wrong for no benefit.
  const core = version.trim().replace(/^v/i, '').split(/[-+]/)[0]
  if (!core) return null

  const parts = core.split('.')
  if (parts.length === 0 || parts.length > 3) return null

  const numbers: number[] = []
  for (const part of parts) {
    // `Number('')` is 0 and `Number('1a')` is NaN; both must be rejected rather than
    // silently becoming a number, or `'1..0'` and `'1.x.0'` would compare as valid.
    if (!/^\d+$/.test(part)) return null
    const n = Number(part)
    if (!Number.isSafeInteger(n)) return null
    numbers.push(n)
  }
  // `1.2` means `1.2.0`.
  while (numbers.length < 3) numbers.push(0)
  return numbers
}

/**
 * `-1` if a < b, `0` if equal, `1` if a > b.
 * **`null` if either side is not a parseable version** — the caller must decide what an
 * unanswerable comparison means, and in this app it always means "do not act".
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = parse(a)
  const right = parse(b)
  if (!left || !right) return null

  for (let i = 0; i < 3; i += 1) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (l < r) return -1
    if (l > r) return 1
  }
  return 0
}

/** True only when both parse AND `version` is strictly older than `minimum`. */
export function isOlderThan(version: string, minimum: string): boolean {
  return compareVersions(version, minimum) === -1
}
