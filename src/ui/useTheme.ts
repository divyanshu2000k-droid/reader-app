/**
 * src/ui/useTheme.ts
 *
 * Resolves the active colour scheme. Every component reads colours through this, never
 * from `dark` or `light` directly, so the light-mode accent split is impossible to get
 * wrong by importing the wrong object.
 */

import { useColorScheme } from 'react-native'

import { dark, light, type ColorScheme } from './theme'

/**
 * No cast. Both palettes `satisfies Palette` at their declaration in theme.ts, so a
 * token present in one scheme and missing from the other is a compile error there
 * rather than something a cast silently swallows here.
 */
export function useColors(): ColorScheme {
  return useColorScheme() === 'light' ? light : dark
}

export function useIsDark(): boolean {
  return useColorScheme() !== 'light'
}
