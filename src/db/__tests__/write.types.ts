/**
 * COMPILE-TIME ASSERTIONS for the write path. Checked by `npm run typecheck`, never
 * executed, and so deliberately not a `*.test.ts` that would count as a runtime pass.
 * Each `@ts-expect-error` is the assertion: if its line ever compiles, typecheck fails.
 */

import type { updateRow, writeRow } from '../write'

declare const write: typeof writeRow
declare const update: typeof updateRow

export function writeTypeAssertions(): void {
  const session = {
    id: 's',
    readId: 'r',
    occurredAt: 0,
    format: 'pages',
    isTimed: 0,
  } as const

  // @ts-expect-error local_day is derived from occurredAt by the write path. A caller that
  // could supply it could supply one that disagrees.
  void write('sessions', { ...session, localDay: '2026-01-01' })

  // @ts-expect-error Nor patch it alone, which is exactly how it came apart from occurredAt.
  void update('sessions', 's', { localDay: '2026-01-01' })

  // @ts-expect-error exactOptionalPropertyTypes: "set note to undefined" is not a write.
  void update('sessions', 's', { note: undefined })

  // What callers do must keep compiling: a whole session, a moved instant, a cleared note.
  void write('sessions', session)
  void update('sessions', 's', { occurredAt: 0 })
  void update('sessions', 's', { note: null })
}
