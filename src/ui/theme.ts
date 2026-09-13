/**
 * src/ui/theme.ts
 *
 * Single source of truth for every visual value in the app.
 * Extracted from the design system canvas so the values live in code, not in a link.
 *
 * RULE: no component may ever hardcode a colour, radius, spacing or font size.
 * If you need a value that is not here, add it here first.
 */

import type { TextStyle } from 'react-native'

import brand from './brand.json'
import { rgbChannels, shiftHsl, withAlpha } from './color'

// ─── COLOUR ──────────────────────────────────────────────────────────────────

/**
 * EVERY ACCENT VARIANT, DERIVED FROM THE ONE HEX IN brand.json.
 *
 * These were six hand-typed values per scheme: the accent itself, a lighter one, a darker
 * ink for light mode, two near-blacks to sit on it, a hairline, and the accent's channels
 * spelled out again inside four rgba strings and the glow. A rebrand had to find and
 * change all of them, and one missed would ship without any error.
 *
 * Each is now a fixed HSL offset from the base, fitted to the design sheet: for
 * `#F9BE3D` every offset reproduces the sheet's hex within one channel step
 * (src/ui/__tests__/theme.test.ts). Offsets, not absolute colours, because the
 * relationship is what survives a rebrand: "lighter and warmer" is still true of a new
 * accent where `#FFD173` is only true of the old one.
 *
 * WHAT DERIVATION CANNOT PROMISE: contrast. A very light or very dark new accent can push
 * `onAccent` or light-mode `accentInk` below a readable ratio. The theme test asserts
 * the ratios, so a rebrand that breaks them fails there rather than on a reader's phone.
 */
export function accentVariants(base: string) {
  return {
    base,
    /** Highlights on the accent: the design's "accent light". */
    light: shiftHsl(base, { h: -0.9, s: 6, l: 11.8 }),
    /**
     * Light mode's accent for text, icons and hairlines. Bright gold on white fails.
     *
     * CORRECTED FROM THE DESIGN SHEET, 2026-09-10. The sheet's `#A4681A` (l −23.5) measured
     * 4.26:1 on the light ground and 3.89:1 on the pill button's background: below WCAG
     * AA's 4.5:1 for the small text it carries (the focused tab label, Undo, pill labels).
     * l −26.6 gives `#965F18`: 4.94:1 on the ground, 4.51:1 on the pill. Same hue and
     * saturation offsets; 3.1 points darker. contrast.test.ts holds it there.
     */
    inkOnLight: shiftHsl(base, { h: -7.3, s: -21.4, l: -26.6 }),
    /** Text and icons ON an accent fill, per scheme. */
    onAccentDark: shiftHsl(base, { h: -3.7, s: -39.5, l: -52.2 }),
    onAccentLight: shiftHsl(base, { h: -2.3, s: -26, l: -51 }),
    /** Light mode's accent border, before its alpha. */
    hairlineOnLight: shiftHsl(base, { h: -1.4, s: -20.5, l: -16.5 }),
  } as const
}

const accent = accentVariants(brand.accent)

/**
 * The contract both schemes must satisfy.
 *
 * Declaring this explicitly, rather than deriving `ColorScheme` from `typeof dark`, is
 * what lets `useColors()` return either palette without a cast. A cast there would hide
 * exactly the mistake this type exists to catch: a token added to one scheme and
 * forgotten in the other.
 */
export interface Palette {
  readonly ground: string
  readonly surface: string
  readonly surfaceRaised: string
  readonly border: string
  readonly borderStrong: string
  readonly text: string
  readonly textSecondary: string
  /** The faintest colour allowed for TEXT. 4.5:1 on every surface, both schemes. */
  readonly textMuted: string
  /**
   * NOT FOR TEXT. Idle icons and other non-text marks, held to WCAG's 3:1 for graphics.
   * It was the placeholder and idle-tab-label colour until 2026-09-10, at 2.41:1 in light
   * mode. contrast.test.ts fails if it is used as a text colour again.
   */
  readonly textFaint: string
  /** NOT FOR TEXT, and not for anything that must be seen: the grabber, a progress track. */
  readonly textGhost: string
  readonly accent: string
  readonly accentLight: string
  /** Light mode splits the accent: fills use `accent`, text and hairlines use this. */
  readonly accentInk: string
  readonly onAccent: string
  readonly accentSurface: string
  readonly accentBorder: string
  readonly danger: string
  readonly dangerSurface: string
  readonly dangerBorder: string
  readonly success: string
  readonly successSurface: string
  readonly glow: { readonly color: string; readonly peakAlpha: number }
}

export const dark = {
  // From brand.json, because the Android adaptive icon needs this exact value and
  // app.config.ts cannot import a .ts module. See the note in that file.
  ground: brand.ground,
  surface: 'rgba(255,255,255,0.03)',
  surfaceRaised: 'rgba(255,255,255,0.055)',
  border: 'rgba(255,255,255,0.055)',
  borderStrong: 'rgba(255,255,255,0.09)',

  text: '#F5F0E8',
  textSecondary: '#C8C0B2',
  textMuted: '#8A8172',
  textFaint: '#6F6759',
  textGhost: '#45454E',

  // Every accent value is derived from brand.accent. See `accentVariants` above.
  accent: accent.base,
  accentLight: accent.light,
  accentInk: accent.base,      // same as accent in dark; differs in light
  onAccent: accent.onAccentDark,
  accentSurface: withAlpha(accent.base, 0.13),
  accentBorder: withAlpha(accent.base, 0.28),

  danger: '#D97C77',
  dangerSurface: 'rgba(158,59,54,0.10)',
  dangerBorder: 'rgba(201,101,96,0.28)',

  success: '#86BC84',
  successSurface: 'rgba(122,180,120,0.10)',

  /**
   * Radial glow every screen carries. Never a flat fill.
   * NOT a CSS string: React Native has no CSS gradients. See `glowSpec` below for how
   * to render this.
   */
  glow: { color: rgbChannels(accent.base), peakAlpha: 0.13 },
} as const satisfies Palette

export const light = {
  // From brand.json, for the same reason as `dark.ground`: the native splash screen
  // config needs this exact value and cannot import a .ts module.
  ground: brand.groundLight,
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: 'rgba(31,27,19,0.08)',
  borderStrong: 'rgba(31,27,19,0.12)',

  text: '#1F1B13',
  textSecondary: '#55503F',
  // CORRECTED, 2026-09-10: the sheet's #7D7462 was 4.28:1 on the ground. Darkened by the
  // least that clears 4.5:1 (lightness −1.4): 4.54:1.
  textMuted: '#79705F',
  // NOT A TEXT COLOUR (see Palette). Corrected from #A8A08E, which was 2.41:1 and failed
  // even the 3:1 that icons need; lightness −7.3 gives 3.01:1.
  textFaint: '#988E79',
  textGhost: '#C5BDA9',

  accent: accent.base,         // FILLS ONLY
  accentLight: accent.light,
  /**
   * CRITICAL: in light mode the accent splits.
   * `accent` is for filled surfaces only. `accentInk` is for any text, icon or hairline.
   * Bright gold on white fails contrast and is the most common way this palette breaks.
   */
  accentInk: accent.inkOnLight,
  onAccent: accent.onAccentLight,
  accentSurface: withAlpha(accent.base, 0.2),
  accentBorder: withAlpha(accent.hairlineOnLight, 0.34),

  danger: '#9E3B36',
  dangerSurface: 'rgba(158,59,54,0.08)',
  dangerBorder: 'rgba(158,59,54,0.22)',

  // CORRECTED, 2026-09-10: the sheet's #3D8B5E was 3.86:1 on the ground. Lightness −3.6
  // gives 4.55:1. Unused by any screen yet, which is the cheapest time to fix it.
  success: '#377E55',
  successSurface: 'rgba(122,180,120,0.12)',

  glow: { color: rgbChannels(accent.base), peakAlpha: 0.22 },
} as const satisfies Palette

// ─── TYPE ────────────────────────────────────────────────────────────────────
// One typeface throughout, named in brand.json and embedded by app.config.ts from the same
// entry. The weights below must each have a file there; brand-font.test.ts checks.

const scale = {
  hero:       { size: 92, weight: '800', letterSpacing: -4.6, lineHeight: 79 },
  displayLg:   { size: 68, weight: '800', letterSpacing: -3.4, lineHeight: 65 },
  display:     { size: 30, weight: '800', letterSpacing: -1.0, lineHeight: 35 },
  title:       { size: 25, weight: '700', letterSpacing: -0.6, lineHeight: 30 },
  heading:     { size: 17, weight: '600', letterSpacing: -0.3, lineHeight: 22 },
  bodyStrong:  { size: 14.5, weight: '600', letterSpacing: -0.15, lineHeight: 20 },
  body:        { size: 13, weight: '500', lineHeight: 20 },
  secondary:   { size: 11.5, weight: '500', lineHeight: 17 },
  label:       { size: 11, weight: '500', lineHeight: 15 },
  caption:     { size: 10.5, weight: '500', lineHeight: 14 },

  // ── CONTROL TYPE ──
  // These four used to be written at the call site as arithmetic on the sizes above —
  // `font.bodyStrong.size + 1`, `font.body.size + 0.5`, `font.secondary.size + 1`,
  // `font.heading.size + 1`. That is a font size that does not exist in the scale,
  // spelled so it reads as if it does. Four components each invented their own.
  // If a size is real it belongs here with a name; if it is not, it should not be used.
  /** The centred title on a full-screen notice: update required, error boundary. */
  notice:      { size: 18, weight: '700', letterSpacing: -0.36, lineHeight: 24 },
  /** A tab bar label. 10px is below the 12px body floor, which is fine: it is a label
   *  attached to an icon with an accessibilityLabel, not readable content. */
  tab:         { size: 10, weight: '500', lineHeight: 13 },
  button:      { size: 15.5, weight: '700', lineHeight: 21 },
  buttonSmall: { size: 13.5, weight: '600', lineHeight: 19 },
  chip:        { size: 12.5, weight: '500', lineHeight: 17 },
  input:       { size: 18, weight: '600', lineHeight: 24 },
} as const

export const font = {
  /** From brand.json. app.config.ts embeds the files under this same name. */
  family: brand.fontFamily,
  ...scale,

  // ── WEIGHT VARIANTS ──
  // A few controls use one size at two weights. These used to be a `weight` override at
  // six call sites, so a weight could be anything and the scale no longer described what
  // the app rendered. Each is now a named token built FROM its base size: the size is
  // shared by construction, and only the weight differs.
  /** The initial on a cover with no image. */
  coverInitial:     { ...scale.bodyStrong, weight: '700' },
  coverInitialHero: { ...scale.title, weight: '700' },
  /** A pill button's label: the secondary size, at a control's weight. */
  pillLabel:        { ...scale.secondary, weight: '600' },
  chipSelected:     { ...scale.chip, weight: '600' },
  segment:          scale.body,
  segmentSelected:  { ...scale.body, weight: '600' },
  /** The raised Add tab's label: stronger than an idle tab, lighter than the focused one. */
  tabRaised:        { ...scale.tab, weight: '600' },
  tabFocused:       { ...scale.tab, weight: '700' },
  /** Undo, and any action inside a toast. */
  toastAction:      { ...scale.body, weight: '700' },
} as const

/**
 * One type token, resolved into a React Native text style.
 *
 * EVERY `<Text>` in the app goes through this, and that is the point: `font.family` was
 * declared in this file from the first commit and applied by nothing, so the whole app
 * rendered in Roboto while the design system said otherwise. A component that spells out
 * `fontSize` and `fontWeight` by hand is a component that will forget the family, and
 * nothing about the result looks broken enough to notice.
 *
 * One argument, deliberately. It used to take a weight override; a control that needs a
 * second weight now gets a named token above. The lint rule forbids a second argument.
 */
export function typeStyle(token: {
  readonly size: number
  readonly weight?: string
  readonly lineHeight?: number
}): TextStyle {
  return {
    fontFamily: font.family,
    fontSize: token.size,
    fontWeight: token.weight as TextStyle['fontWeight'],
    lineHeight: token.lineHeight,
  }
}

// ─── SIZE, SPACE, RADIUS ─────────────────────────────────────────────────────

// The values the ARITHMETIC tokens are built from, named once so that changing one moves
// every token derived from it. `tabRaised`, `iconButtonHitSlop` and `toastLift` used to be
// stored as their results (62, 3, 66): change the fab and the ring around it stayed 62.
const fab = 52
const tabBar = 58
const tabRaiseRing = 5
const minTouch = 44
const iconButton = 38
const row = 8

export const size = {
  /** Nothing tappable may be smaller than this. */
  minTouch,
  buttonPrimary: 56,
  buttonSecondary: 46,
  field: 54,
  /** A multiline field starts two rows tall. Named, not `field * 2` at the call site. */
  fieldMultiline: 108,
  iconButton,
  iconButtonLarge: 44,
  fab,
  timerButton: 68,
  coverList: { w: 50, h: 74 },
  coverHeader: { w: 44, h: 64 },
  coverDock: { w: 38, h: 54 },
  coverHero: { w: 84, h: 124 },
  progressBar: 3,
  pill: 34,
  grabber: { w: 38, h: 4 },
  /** The rounded square holding the icon on a full-screen notice. */
  noticeIcon: 62,
  /** The tab bar's own height, above the safe-area inset. */
  tabBar,
  /** How far the raised Add button rises above the tab bar. */
  tabRaise: 28,
  /** The ring of ground colour that separates the raised button from the bar. */
  tabRaiseRing,
  /** The raised button's full diameter: the fab plus its ground ring on both sides. */
  tabRaised: fab + 2 * tabRaiseRing,
  /** Pads a header icon button up to the minimum touch target, on each side. */
  iconButtonHitSlop: (minTouch - iconButton) / 2,
  /** Extra tap area around controls whose visual box is smaller than minTouch. */
  hitSlop: 10,
  hitSlopTight: 6,
  /** A skeleton line's height when the caller has no real line height to match. */
  skeletonLine: 12,
} as const

/** Icon glyph sizes, from the design files. The design draws them on a 24-unit grid. */
export const iconSize = {
  base: 21,
  /** Inside a 38px header icon button. */
  header: 17,
  /** Inside a full-screen notice's icon square. */
  notice: 27,
  /** The plus on the raised Add tab. */
  raised: 23,
  /** A rating star on book detail. */
  star: 17,
} as const

/** Stroke weights: navigation icons at 1.9, emphasis heavier. */
export const iconStroke = {
  base: 1.9,
  header: 2,
  notice: 1.8,
  raised: 2.5,
} as const

export const space = {
  screen: 22,      // horizontal screen padding
  /** Between a notice's icon, title, body and action. */
  notice: 22,
  /** Between the tab bar's icon and its label. */
  tabLabel: 5,
  card: 18,        // inside a card
  cardTight: 12,   // inside a compact card
  row,             // between list rows
  rowWide: 14,     // between a cover and the text beside it
  section: 20,     // between sections
  bottomSafe: 22,  // above the nav bar

  // ── CONTROL SPACING ──
  // Named rather than written inline. The lint rule below forbids bare numbers on
  // spacing properties, so a value that is not here cannot be used.
  stackTight: 10,  // between stacked lines in an empty state
  labelGap: 6,     // between a field label and its input
  buttonPadX: 18,
  pillPadX: 14,
  chipPadX: 16,
  fieldPadX: 17,
  fieldPadY: 12,
  segmentPad: 4,   // inner padding and gap of the segmented control
  sheetTop: 10,    // above the grabber
  sheetTitleGap: 12,
  sheetGap: 12,    // between a sheet's children
  toastGap: 16,    // between the toast message and its Undo
  toastPadX: 16,
  toastPadY: 14,
  /**
   * Clears the tab bar: its height plus a row gap. A static lift, so a screen without the
   * bar still gets it; measuring the real bar is Slice 11 polish (DECISIONS, 2026-09-10).
   */
  toastLift: tabBar + row,
} as const

export const radius = {
  cover: 6,
  coverLarge: 8,
  field: 16,
  card: 18,
  sheet: 22,
  button: 18,
  buttonSmall: 14,
  chip: 999,
  pill: 999,
  segment: 15,      // the segmented control's outer track
  segmentInner: 12, // one selected segment
  grabber: 2,
  skeleton: 6,
  /** The icon container on a full-screen notice. */
  notice: 20,
} as const

/**
 * Drop shadows. React Native has no `box-shadow` string, so a shadow is four values and
 * they have to travel together or they drift apart between components.
 */
export const shadow = {
  cover: { opacity: 0.5, radius: 14, offsetY: 4, elevation: 4 },
} as const

// ─── ATMOSPHERE ──────────────────────────────────────────────────────────────
/**
 * React Native has no `radial-gradient`. Every screen still needs the warm glow that
 * separates this design from a flat wireframe, so render it as a component:
 *
 *   import Svg, { RadialGradient, Defs, Rect, Stop } from 'react-native-svg'
 *
 *   <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
 *     <Defs>
 *       <RadialGradient id="g" cx="50%" cy={glowSpec.cy} rx={glowSpec.rx} ry={glowSpec.ry}>
 *         <Stop offset="0"   stopColor={`rgb(${c.glow.color})`} stopOpacity={c.glow.peakAlpha} />
 *         <Stop offset="0.7" stopColor={`rgb(${c.glow.color})`} stopOpacity={0} />
 *       </RadialGradient>
 *     </Defs>
 *     <Rect width="100%" height="100%" fill="url(#g)" />
 *   </Svg>
 *
 * Build it once as `<ScreenGlow variant="top" | "centre" />` in Slice 0 and never think
 * about it again. `react-native-svg` is an Expo-managed dependency, no config needed.
 *
 * expo-linear-gradient is NOT a substitute: it does linear only.
 */
// ─── COVER FALLBACKS AND SCRIM ───────────────────────────────────────────────

/**
 * Cover fallback hues. No cover is the common case, not the edge case, so these are a
 * real part of the palette rather than an afterthought.
 *
 * Deliberately muted and deliberately NOT the accent: a wall of gold covers would fight
 * the one colour the design uses to mean "active". Picked deterministically from the
 * title so a book never changes colour between the list and the detail screen.
 */
export const coverFallbacks = [
  '#2E2E38',
  '#33303A',
  '#2B3330',
  '#3A3129',
  '#2C3138',
  '#382E31',
] as const

/** Behind every sheet and modal. Same in both themes: it darkens whatever is beneath. */
export const scrim = 'rgba(0,0,0,0.55)'

export const glowSpec = {
  top:    { cy: '-8%', rx: '130%', ry: '55%' },   // Library, Stats, most screens
  centre: { cy: '40%', rx: '95%',  ry: '42%' },   // Reading timer
  upper:  { cy: '20%', rx: '115%', ry: '45%' },   // Log session, sheets
} as const

// ─── MOTION ──────────────────────────────────────────────────────────────────

export const motion = {
  press:      { scale: 0.97, opacity: 0.9, duration: 120, easing: 'ease-out' },
  screenPush: { duration: 240, easing: 'cubic-bezier(0.2,0,0,1)' },
  sheetUp:    { duration: 280, easing: 'cubic-bezier(0.2,0,0,1)' },
  scrimFade:  { duration: 200 },
  toastIn:    { duration: 180 },
  shimmer:    { duration: 1400, easing: 'linear' },
  progressBar:{ duration: 400 },
  /** The one number that animates on the home screen, on a session save. */
  countUp:    { duration: 600 },
  /** Honour the OS reduce-motion setting by zeroing every duration above. */
  reducedMotionDuration: 0,
} as const

/**
 * Every opacity a component applies. Four were written inline (0.4, 0.9, 0.6, 0.35) until
 * the lint rule learned to look at opacity; a dimmed control is a design value like any
 * other, and two components choosing different dims for "disabled" is visible drift.
 */
export const opacity = {
  /** A control that cannot be used right now. */
  disabled: 0.4,
  /** A pressed control that does not scale. The same dim as `motion.press`. */
  pressed: motion.press.opacity,
  /** The sheet's grabber, against `textGhost`. */
  grabber: 0.6,
  /** The skeleton shimmer pulses between floor and floor + range. */
  shimmerFloor: 0.35,
  shimmerRange: 0.35,
} as const

// ─── RULES ENCODED AS CONSTANTS ──────────────────────────────────────────────

export const rules = {
  /** Below this, show no loading state at all. A flashed skeleton looks broken. */
  loadingThresholdMs: 400,
  /** Undo toast lifetime. */
  toastMs: 5000,
  /** A second press inside this window is the other half of a double tap. ui/pressGuard.ts */
  pressDebounceMs: 600,
  /** Soft-deleted rows are purged after this. */
  trashRetentionDays: 30,
  /** Search input debounce. */
  searchDebounceMs: 300,
  /** Hard budget: taps from home screen to a logged session. */
  maxTapsToLog: 2,
  /** Narrowest screen that must work without horizontal scroll. */
  minScreenWidth: 360,
  /** Layouts must survive this font scale without clipping. */
  maxFontScale: 2.0,
  /** A sheet never covers the whole screen: what is behind it stays visible. */
  sheetMaxHeightFraction: 0.9,
} as const

// ─── THEME OBJECT ────────────────────────────────────────────────────────────

/**
 * Both schemes satisfy `Palette`, so `useColors()` can return either without a cast.
 * `satisfies` on each declaration above is what enforces it: a token missing from one
 * scheme is a compile error at the palette, not a surprise at a call site.
 */
export type ColorScheme = Palette

export const theme = {
  dark,
  light,
  font,
  space,
  radius,
  size,
  iconSize,
  iconStroke,
  motion,
  opacity,
  rules,
  glowSpec,
  coverFallbacks,
  scrim,
  shadow,
  typeStyle,
} as const
export type Theme = typeof theme
