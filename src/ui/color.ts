/**
 * src/ui/color.ts
 *
 * The arithmetic behind the palette, so theme.ts can DERIVE every accent variant from the
 * one hex in brand.json instead of storing six hand-typed copies of it.
 *
 * Before this, the accent appeared as `#F9BE3D`, as `249,190,61` inside four rgba strings
 * and a glow triplet, and as four darker and lighter hexes, across two schemes. A rebrand
 * that changed the first and missed one of the others would ship a button in the new
 * colour with its focus ring still in the old one, and nothing would fail.
 *
 * Pure and dependency-free: it runs in theme.ts on the phone and under `node --test`.
 */

type Rgb = readonly [number, number, number]

const HEX = /^#([0-9a-f]{6})$/i

export function hexToRgb(hex: string): Rgb {
  const m = HEX.exec(hex)
  // Throwing is correct here: this runs when theme.ts loads, so a malformed brand colour
  // fails the first render in development instead of rendering black everywhere.
  if (!m?.[1]) throw new Error(`Not a #rrggbb colour: ${hex}`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

/** Hue in degrees, saturation and lightness in percent. */
function rgbToHsl([r8, g8, b8]: Rgb): Rgb {
  const r = r8 / 255
  const g = g8 / 255
  const b = b8 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}

function hslToRgb([h, s100, l100]: Rgb): Rgb {
  const s = s100 / 100
  const l = l100 / 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
  }
  return [f(0), f(8), f(4)]
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** A shift in HSL space, relative to a base colour. */
export interface HslShift {
  /** Degrees. */
  readonly h?: number
  /** Percentage points of saturation. */
  readonly s?: number
  /** Percentage points of lightness. */
  readonly l?: number
}

/**
 * The base colour moved by a fixed HSL offset. Offsets rather than absolute colours are
 * what make the relationship survive a rebrand: "a little lighter and more saturated" is
 * still true of a new accent, where "#FFD173" is only true of the old one.
 */
export function shiftHsl(hex: string, shift: HslShift): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex))
  return rgbToHex(
    hslToRgb([
      (((h + (shift.h ?? 0)) % 360) + 360) % 360,
      clamp(s + (shift.s ?? 0), 0, 100),
      clamp(l + (shift.l ?? 0), 0, 100),
    ]),
  )
}

/** `rgba(r,g,b,a)`, the form React Native takes for a translucent colour. */
export function withAlpha(hex: string, alpha: number): string {
  return `rgba(${rgbChannels(hex)},${alpha})`
}

/** `r,g,b`: the glow spec's form, which composes its own alpha per gradient stop. */
export function rgbChannels(hex: string): string {
  return hexToRgb(hex).join(',')
}

/**
 * A `#rrggbb` or `rgba(r,g,b,a)` colour laid over an opaque base, as the eye sees it.
 *
 * Contrast is only defined between opaque colours, and several theme surfaces are
 * translucent (`surface` is 3% white in dark mode, `accentSurface` is 20% accent). Measuring
 * text against the rgba string itself would be measuring against nothing.
 */
export function composite(color: string, base: string): string {
  const b = hexToRgb(base)
  if (HEX.test(color)) return color.toUpperCase()
  const m = /^rgba?\(([^)]+)\)$/.exec(color.replace(/\s/g, ''))
  const parts = m?.[1]?.split(',').map(Number)
  if (!parts || parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Not a colour: ${color}`)
  }
  const a = parts[3] ?? 1
  return rgbToHex(
    [0, 1, 2].map((i) =>
      Math.round((parts[i] ?? 0) * a + (b[i] ?? 0) * (1 - a)),
    ) as unknown as Rgb,
  )
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex).map((v) => {
      const c = v / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }) as unknown as Rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
