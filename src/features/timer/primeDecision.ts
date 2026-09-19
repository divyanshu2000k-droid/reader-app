/**
 * src/features/timer/primeDecision.ts
 *
 * WHETHER TO ASK THE READER ABOUT NOTIFICATIONS. Pure, so it can be asserted in node.
 *
 * Its own module rather than a function inside `NotificationPriming.tsx` for one practical
 * reason: that file imports `expo-notifications` and React Native, so a node test that
 * imports it dies on `__DEV__ is not defined` before reaching the assertion. The same
 * separation as `notes/noteForm.ts` — the rules apart from the screen that renders them.
 */

export interface PrimeInputs {
  /** Whether WE have shown the priming sheet before, by any answer including "Not now". */
  readonly askedBefore: boolean
  /** Android's own view: 'granted' | 'denied' | 'undetermined'. */
  readonly status: string
  /** Whether Android would still show its prompt. */
  readonly canAskAgain: boolean
}

/**
 * Ask at most once, ever.
 *
 * ─── WHY `askedBefore` CANNOT BE DERIVED FROM THE OTHER TWO ──────────────────
 *
 * This decision used to be made from Android's answer alone, and the sheet came back on
 * every new timer for a reader who had already declined. Measured on a phone, 2026-09-19.
 *
 * The cause is a wrong question rather than a typo. "Not now" is DELIBERATELY never passed
 * to Android: the point of the sheet is that Android's one-shot prompt is not spent until
 * the reader has been told what it buys them. So after "Not now" the status is still
 * `undetermined` and `canAskAgain` is still true, and Android's honest answer to "would you
 * still ask?" is yes — forever. **Android cannot remember an answer it was never given.**
 *
 * The decision, 2026-09-19 (DECISIONS.md): declining is final. The sheet's own copy tells
 * the reader what it costs them — more recovery sheets, never a lost number — and Android's
 * Settings is the way back. The alternative considered was asking again once the reader had
 * actually met a recovery sheet: better targeted, and still nagging.
 */
export function primeDecision(inputs: PrimeInputs): boolean {
  if (inputs.askedBefore) return false
  if (inputs.status === 'granted') return false
  // Android has refused and will not be asked again: the sheet could only offer something it
  // can no longer deliver.
  if (inputs.status !== 'undetermined' && !inputs.canAskAgain) return false
  return true
}
