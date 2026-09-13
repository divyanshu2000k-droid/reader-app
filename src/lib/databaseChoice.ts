/**
 * src/lib/databaseChoice.ts
 *
 * WHICH DATABASE FILE THIS BUILD OPENS. Pure, so the one property that matters is asserted
 * under node rather than argued in a comment.
 *
 * ─── A RELEASE BUILD OPENS THE READER'S LIBRARY. ALWAYS. ────────────────────────
 *
 * The first version honoured the sandbox and device-pass flags in every build. Any build
 * made from a shell with `EXPO_PUBLIC_SANDBOX_DB=1` exported would ship an app that wrote
 * every reader's books to `devcheck.db`. The next normal build opens `reader.db`, and their
 * library looks empty: nothing deleted, all of it invisible, new writes landing in the other
 * file. That build was actually made on 2026-09-13, for a scroll measurement. The review
 * caught it before anything shipped.
 *
 * So the flags are ignored unless this is a development build. `__DEV__` is decided by the
 * bundler, and the flags by whatever environment happened to be exported — only one of those
 * two is safe to trust with a reader's library.
 *
 * The device pass and the sandbox get separate files. The pass is destructive and leaves
 * soft-deleted rows behind on every run; a sandbox kept for measuring screens should not
 * slowly fill with them.
 */

export type DatabaseChoice = 'library' | 'devcheck' | 'sandbox'

export const DATABASE_FILES: Readonly<Record<DatabaseChoice, string>> = {
  library: 'reader.db',
  devcheck: 'devcheck.db',
  sandbox: 'sandbox.db',
}

export interface DatabaseFlags {
  readonly devicePass: boolean
  readonly sandboxDb: boolean
}

export function chooseDatabase(
  isDevelopmentBuild: boolean,
  flags: DatabaseFlags,
): DatabaseChoice {
  if (!isDevelopmentBuild) return 'library'
  if (flags.devicePass) return 'devcheck'
  if (flags.sandboxDb) return 'sandbox'
  return 'library'
}
