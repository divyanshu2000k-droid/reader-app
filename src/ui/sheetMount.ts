/**
 * src/ui/sheetMount.ts
 *
 * WHEN `Sheet` RENDERS ITS MODAL. Pure, so the rules are tested.
 *
 * Found on the phone, 2026-09-13: tapping Book actions never opened the sheet. Nothing threw,
 * Back worked, and logging showed `mounted` go true and then false with `visible` still true.
 *
 * The cause was React, not the animation. `mounted` was derived during render
 * (`if (visible) setMounted(true)`). A closed sheet's first exit animation had finished on
 * mount and called `setMounted(false)` while it was already false. React bailed out of that
 * render but kept the update queued at default priority. The tap rendered at sync priority,
 * skipped the queued update, and so kept the hook's base state at false. React does not carry
 * a render-phase update into the base state while an update is skipped, so the later
 * default-priority render replayed from false. The sheet opened for one render and closed
 * itself.
 *
 * Two rules follow, each held here:
 * - An open sheet always renders: `visible` alone decides it, and the lagging state only
 *   extends rendering through the exit. Losing that state can cut an exit animation short, and
 *   can never keep a sheet shut.
 * - A finished exit ends only if the sheet is still closed now, not when the animation began.
 */

export function shouldRenderSheet(visible: boolean, exiting: boolean): boolean {
  return visible || exiting
}

export function shouldUnmountAfterExit(
  finished: boolean | undefined,
  visibleNow: boolean,
): boolean {
  return finished === true && !visibleNow
}
