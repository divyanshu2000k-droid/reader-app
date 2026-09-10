/**
 * COMPILE-TIME ASSERTIONS. Checked by `npm run typecheck`, never executed.
 *
 * Deliberately not named `*.test.ts`: nothing here runs, so nothing here may be counted as
 * a passing runtime test. A runtime test that asserted nothing would inflate the count;
 * see the runtime/compile-time split in `devchecks.ts`. Each `@ts-expect-error` below is
 * the assertion — if the line ever compiles, the directive is unused and typecheck fails.
 *
 * `runInTransaction` shipped as `task: () => void`, which accepts an async function, and
 * an async task commits before its statements run: bug #1 in CLAUDE.md, reopened in the
 * function written to close it.
 */

import type { runInTransaction } from '../client'

declare const run: typeof runInTransaction

export function transactionTypeAssertions(): void {
  // @ts-expect-error An async task commits before its statements run. Nothing rolls back.
  run(async () => {})

  // @ts-expect-error The same bug without the keyword: a task that returns a promise.
  run(() => Promise.resolve())

  // @ts-expect-error A task handing back an async function's result is still a promise.
  run(() => (async () => undefined)())

  // The shapes the write path actually uses must keep compiling.
  run(() => {})
  run(() => {
    if (Date.length > 0) return
  })
}
