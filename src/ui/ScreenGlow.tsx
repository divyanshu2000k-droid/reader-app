/**
 * src/ui/ScreenGlow.tsx
 *
 * Every screen carries one radial amber glow. Never a flat fill — the theme file notes
 * that a flat background is what made the first design draft read as a wireframe.
 *
 * React Native has no `radial-gradient` and expo-linear-gradient does linear only, so
 * this is SVG. Built once here, per the instruction in theme.ts, so no screen has to
 * think about it again.
 */

import { useId } from 'react'
import { StyleSheet } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'

import { glowSpec } from './theme'
import { useColors } from './useTheme'

export function ScreenGlow({ variant = 'top' }: { variant?: keyof typeof glowSpec }) {
  const c = useColors()
  const spec = glowSpec[variant]

  /**
   * A UNIQUE gradient id per instance.
   *
   * This was the literal string "screenGlow". SVG ids are global to the document, so two
   * Screens mounted at once — which happens the moment a sheet hosts one over another —
   * define the same id twice and `url(#screenGlow)` resolves to whichever won. In light
   * mode over dark, or across two glow variants, that is a visibly wrong background with
   * nothing in the component to explain it.
   *
   * `useId` contains characters that are not safe in an SVG id reference, so it is
   * stripped down to word characters.
   */
  const gradientId = `screenGlow${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={gradientId} cx="50%" cy={spec.cy} rx={spec.rx} ry={spec.ry}>
          <Stop offset="0" stopColor={`rgb(${c.glow.color})`} stopOpacity={c.glow.peakAlpha} />
          <Stop offset="0.72" stopColor={`rgb(${c.glow.color})`} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
    </Svg>
  )
}
