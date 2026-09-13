/**
 * src/ui/pressGuard.ts
 *
 * WHETHER A PRESS COUNTS, or is the second half of a double tap. Pure, so the rule is tested.
 *
 * "Double taps are idempotent" is a global rule (04-SCREENS). `Button` enforced it with its own
 * copy of this logic, and nothing else did: a quick double tap on a Library row opened book
 * detail twice, and Back then needed two taps. One rule, used by every tappable that navigates
 * or writes, through `usePressGuard`.
 */

export function acceptPress(
  lastAcceptedAt: number | null,
  at: number,
  windowMs: number,
): boolean {
  return lastAcceptedAt === null || at - lastAcceptedAt >= windowMs
}
