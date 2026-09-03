/**
 * src/ui/Screen.tsx
 *
 * The frame every screen sits in: themed ground, the radial glow, safe-area padding and
 * the 22px screen padding. Having this in one place is what stops screen 30 looking
 * different to screen 1.
 */

import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ScreenGlow } from './ScreenGlow'
import { glowSpec, space } from './theme'
import { useColors } from './useTheme'

interface Props {
  children: ReactNode
  glow?: keyof typeof glowSpec | 'none'
  /** Set false for screens that manage their own horizontal padding, e.g. full-bleed lists. */
  padded?: boolean
}

export function Screen({ children, glow = 'top', padded = true }: Props) {
  const c = useColors()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.root, { backgroundColor: c.ground, paddingTop: insets.top }]}>
      {glow === 'none' ? null : <ScreenGlow variant={glow} />}
      <View
        style={[
          styles.content,
          {
            paddingHorizontal: padded ? space.screen : 0,
            paddingBottom: insets.bottom + space.bottomSafe,
          },
        ]}
      >
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
})
