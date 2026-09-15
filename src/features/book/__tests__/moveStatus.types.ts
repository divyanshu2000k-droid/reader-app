/**
 * COMPILE-TIME ASSERTIONS. Checked by `npm run typecheck`, never executed (see
 * `db/__tests__/transaction.types.ts` for why these are not `*.test.ts`).
 *
 * A read reaches Finished only through the finish flow, with the rating and date the reader
 * gives it (Slice 5). Slices 3 and 4 moved it with a status-only write, which left finished books
 * with no date the reader chose. `setReadStatus` takes `MoveStatus`, and this holds it there.
 */

import type { setReadStatus } from '../queries'

declare const move: typeof setReadStatus

export function moveStatusTypeAssertions(): void {
  // @ts-expect-error Finished is the finish flow's: a plain move would skip its rating and date.
  void move('read-id', 'finished')

  // Every other move keeps compiling.
  void move('read-id', 'reading')
  void move('read-id', 'want')
  void move('read-id', 'dnf')
}
