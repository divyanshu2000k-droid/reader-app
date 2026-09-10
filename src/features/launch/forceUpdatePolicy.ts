/**
 * src/features/launch/forceUpdatePolicy.ts
 *
 * THE KILL SWITCH'S DECISION, as a pure function. No network, no `expo-constants`, no
 * React — so it runs under `node --test` and its safety property is actually asserted
 * rather than argued for in a comment.
 *
 * That split is the entire reason this file is separate from `forceUpdate.ts`. The
 * property below cannot be tested through a function that must first reach a CDN, and
 * "we reasoned about it carefully" is how every silent-pass bug in CLAUDE.md happened.
 *
 * ─── THE ONLY PROPERTY THAT MATTERS ───────────────────────────────────────────
 *
 * IT MUST BE IMPOSSIBLE TO LOCK SOMEONE OUT BY ACCIDENT.
 *
 * The update screen has no dismiss — that is the point of it — so every mistake here is a
 * reader who cannot open their library and cannot recover without reinstalling. Blocking
 * is therefore the narrow path: it needs valid JSON, a `minimumVersion` that parses as a
 * version, an app version that parses, and a comparison that says this build is strictly
 * older. Everything else proceeds to the library.
 */

import { compareVersions, isOlderThan } from '@/lib/version'

export interface UpdateRequirement {
  /** The version this build must reach. Used for the decision, not shown to the reader. */
  readonly minimumVersion: string
  /** The version the reader is being sent to get. Also the self-consistency check below. */
  readonly latestVersion: string
  /** Optional override for the body copy, so an incident can explain itself. */
  readonly message: string | null
}

/**
 * The longest override message this screen will render.
 *
 * Bounded because the payload is a file on the internet and this is the one screen with
 * no way out: an unbounded string pushes the button off a 360px phone, and a screen with
 * no dismiss and no reachable button is a brick.
 */
const MAX_MESSAGE = 300

export type ForceUpdateResult =
  | { readonly blocked: false; readonly reason: string }
  | { readonly blocked: true; readonly requirement: UpdateRequirement }

/** Not-blocked, with the reason kept so a launch can be explained after the fact. */
export function proceed(reason: string): ForceUpdateResult {
  return { blocked: false, reason }
}

/**
 * Narrow an unknown payload to the fields we use.
 *
 * Deliberately tolerant of extra keys: the payload must be able to grow — a recommended
 * update, a per-platform block — without older builds treating the new shape as
 * malformed and, worse, without them guessing. Tolerant of unknown keys, strict about
 * every key it reads.
 */
export function readPayload(body: unknown): UpdateRequirement | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const raw = body as Record<string, unknown>

  const minimumVersion = raw.minimumVersion
  if (typeof minimumVersion !== 'string' || minimumVersion.trim().length === 0) return null

  // `latestVersion` is REQUIRED, and the reason is the typo brick vector below.
  const latestVersion = raw.latestVersion
  if (typeof latestVersion !== 'string' || latestVersion.trim().length === 0) return null

  // Trimmed, stripped of control characters, and bounded. A non-string never reaches a
  // <Text> — "Objects are not valid as a React child" on the one screen the reader cannot
  // navigate away from is a crash loop at launch.
  const rawMessage = typeof raw.message === 'string' ? raw.message : null
  const cleaned = rawMessage
    ?.replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE)
  const message = cleaned && cleaned.length > 0 ? cleaned : null

  // There is deliberately NO storeUrl in this payload. The destination is derived from
  // the app's own package id at build time — see `storeUrlFor` in forceUpdate.ts. A
  // remote file that can choose where the single button on an undismissable screen sends
  // the reader is a phishing page they cannot leave, and the store link is knowable
  // locally, so trusting the network for it buys nothing.
  return { minimumVersion: minimumVersion.trim(), latestVersion: latestVersion.trim(), message }
}

/**
 * The decision itself.
 *
 * @param version this build's version, or null when it could not be read — in which case
 *   we have no business blocking anybody.
 * @param body whatever came back from the flag URL, already JSON-parsed. Genuinely
 *   `unknown`: it is a file on the internet.
 */
export function decide(version: string | null, body: unknown): ForceUpdateResult {
  if (!version) return proceed('app version unreadable')

  const requirement = readPayload(body)
  if (!requirement) return proceed('flag payload has no usable minimumVersion')

  if (!isOlderThan(version, requirement.minimumVersion)) {
    return proceed(`build ${version} is at or above ${requirement.minimumVersion}`)
  }

  /**
   * THE SELF-CONSISTENCY GUARD, and the reason `latestVersion` is required.
   *
   * One typo in `minimumVersion` — `11.0.0` for `1.1.0` — retires every build that has
   * ever existed, including the one you would ship to fix it, and every reader is locked
   * out with no recourse. Nothing about that payload is malformed, so no amount of shape
   * validation catches it.
   *
   * So the flag has to agree with itself: the version you are telling readers to go and
   * get must itself clear the floor you are setting. `latest 1.2.0` under a floor of
   * `11.0.0` is incoherent — the update would not satisfy its own requirement — and an
   * incoherent flag is ignored. It now takes two mistakes that agree with each other to
   * lock anyone out, which is a very different failure rate from one.
   */
  // `compareVersions`, not `!isOlderThan`: an UNPARSEABLE latest ('latest', '1.x') makes
  // the comparison null, and `isOlderThan` reads null as "not older" — which would let the
  // block through on exactly the malformed payload this guard exists to stop. The first
  // run of the test suite caught that. Only a parseable latest at or above the floor counts.
  const coherence = compareVersions(requirement.latestVersion, requirement.minimumVersion)
  if (coherence === null || coherence === -1) {
    return proceed(
      `flag is self-inconsistent: latest ${requirement.latestVersion} is below its own minimum ${requirement.minimumVersion}`,
    )
  }

  return { blocked: true, requirement }
}
