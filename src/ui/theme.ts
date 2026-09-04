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

// ─── COLOUR ──────────────────────────────────────────────────────────────────

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
  readonly textMuted: string
  readonly textFaint: string
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

  accent: '#F9BE3D',
  accentLight: '#FFD173',
  accentInk: '#F9BE3D',        // same as accent in dark; differs in light
  onAccent: '#22190A',
  accentSurface: 'rgba(249,190,61,0.13)',
  accentBorder: 'rgba(249,190,61,0.28)',

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
  glow: { color: '249,190,61', peakAlpha: 0.13 },
} as const satisfies Palette

export const light = {
  ground: '#FAF6EE',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: 'rgba(31,27,19,0.08)',
  borderStrong: 'rgba(31,27,19,0.12)',

  text: '#1F1B13',
  textSecondary: '#55503F',
  textMuted: '#7D7462',
  textFaint: '#A8A08E',
  textGhost: '#C5BDA9',

  accent: '#F9BE3D',           // FILLS ONLY
  accentLight: '#FFD173',
  /**
   * CRITICAL: in light mode the accent splits.
   * `accent` is for filled surfaces only. `accentInk` is for any text, icon or hairline.
   * Bright gold on white fails contrast and is the most common way this palette breaks.
   */
  accentInk: '#A4681A',
  onAccent: '#2A1E08',
  accentSurface: 'rgba(249,190,61,0.20)',
  accentBorder: 'rgba(196,140,30,0.34)',

  danger: '#9E3B36',
  dangerSurface: 'rgba(158,59,54,0.08)',
  dangerBorder: 'rgba(158,59,54,0.22)',

  success: '#3D8B5E',
  successSurface: 'rgba(122,180,120,0.12)',

  glow: { color: '249,190,61', peakAlpha: 0.22 },
} as const satisfies Palette

// ─── TYPE ────────────────────────────────────────────────────────────────────
// Plus Jakarta Sans throughout. Load 400/500/600/700/800 via expo-font.

export const font = {
  family: 'PlusJakartaSans',
  hero:        { size: 92, weight: '800', letterSpacing: -4.6, lineHeight: 79 },
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
  button:      { size: 15.5, weight: '700', lineHeight: 21 },
  buttonSmall: { size: 13.5, weight: '600', lineHeight: 19 },
  chip:        { size: 12.5, weight: '500', lineHeight: 17 },
  input:       { size: 18, weight: '600', lineHeight: 24 },
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
 * `weight` may be overridden because a few controls use one size at two weights. The
 * size never can: that is what the scale is for.
 */
export function typeStyle(
  token: { readonly size: number; readonly weight?: string; readonly lineHeight?: number },
  overrides: { readonly weight?: TextStyle['fontWeight'] } = {},
): TextStyle {
  return {
    fontFamily: font.family,
    fontSize: token.size,
    fontWeight: overrides.weight ?? (token.weight as TextStyle['fontWeight']),
    lineHeight: token.lineHeight,
  }
}

// ─── SPACE, RADIUS, SIZE ─────────────────────────────────────────────────────

export const space = {
  screen: 22,      // horizontal screen padding
  card: 18,        // inside a card
  cardTight: 12,   // inside a compact card
  row: 8,          // between list rows
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
  toastLift: 56,   // clears the tab bar
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
} as const

export const size = {
  /** Nothing tappable may be smaller than this. */
  minTouch: 44,
  buttonPrimary: 56,
  buttonSecondary: 46,
  field: 54,
  /** A multiline field starts two rows tall. Named, not `field * 2` at the call site. */
  fieldMultiline: 108,
  iconButton: 38,
  iconButtonLarge: 44,
  fab: 52,
  timerButton: 68,
  coverList: { w: 50, h: 74 },
  coverHeader: { w: 44, h: 64 },
  coverDock: { w: 38, h: 54 },
  coverHero: { w: 84, h: 124 },
  progressBar: 3,
  pill: 34,
  grabber: { w: 38, h: 4 },
  /** Extra tap area around controls whose visual box is smaller than minTouch. */
  hitSlop: 10,
  hitSlopTight: 6,
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

// ─── RULES ENCODED AS CONSTANTS ──────────────────────────────────────────────

export const rules = {
  /** Below this, show no loading state at all. A flashed skeleton looks broken. */
  loadingThresholdMs: 400,
  /** Undo toast lifetime. */
  toastMs: 5000,
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
  motion,
  rules,
  glowSpec,
  coverFallbacks,
  scrim,
  shadow,
  typeStyle,
} as const
export type Theme = typeof theme
