/**
 * src/features/library/rowLayout.ts
 *
 * WHERE A LIBRARY ROW PUTS ITS CONTINUE PILL. Pure, so the rule is tested.
 *
 * Beside the text, as `Main.dc.html` draws it, when there is room. On the phone at a 320 dp
 * display size and 1.3x font, the pill beside the text left the title "The Long ..." and the
 * author "Sally Roo...": a row that loses its label (04-SCREENS, global rules). Room is
 * measured in text-sized units: the window's width divided by the font scale, so large text
 * on a wide phone and normal text on a narrow one are the same case.
 */

/** The narrowest width, in dp at 1x text, that must lay out as designed (`rules.minScreenWidth`). */
export function pillBelowText(widthDp: number, fontScale: number, minWidthDp: number): boolean {
  const scale = fontScale > 0 ? fontScale : 1
  return widthDp / scale < minWidthDp
}
