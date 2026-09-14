/**
 * src/ui/keyboardOverlap.ts
 *
 * HOW MUCH OF A FULL-SCREEN FORM THE KEYBOARD COVERS. Pure, so the rule is tested.
 *
 * The session logger is a full screen, not a sheet (Session.dc.html). Whether Android resizes
 * an edge-to-edge activity for the keyboard depends on the Android version and the window
 * mode, and `Sheet` found out the hard way that a Modal is not resized at all (DECISIONS.md,
 * 2026-09-10). Padding by the keyboard's height is right when the window is NOT resized and
 * doubles the gap when it is.
 *
 * So the screen measures instead: how far its own bottom edge sits below the keyboard's top
 * edge, both in window coordinates. A resized window already ends above the keyboard, and the
 * overlap is zero. An unresized one is covered by exactly the keyboard's height, and the
 * overlap is that. Either way the Save button ends up just above the keyboard.
 */

export function keyboardOverlap(viewBottomY: number, keyboardTopY: number | null): number {
  if (keyboardTopY === null) return 0
  return Math.max(0, Math.round(viewBottomY - keyboardTopY))
}
