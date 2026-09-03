/**
 * src/ui/useTheme.ts
 *
 * Resolves the active colour scheme. Every component reads colours through this, never
 * from `dark` or `light` directly, so the light-mode accent split is impossible to get
 * wrong by importing the wrong object.
 */

import { useColorScheme } from 'react-native'

import { dark, light, type ColorScheme } from './theme'

export function useColors(): ColorScheme {
  const scheme = useColorScheme()
  // `light` is structurally identical to `dark`, so the ColorScheme type covers both.
  return scheme === 'light' ? (light as unknown as ColorScheme) : dark
}

export function useIsDark(): boolean {
  return useColorScheme() !== 'light'
}
