/**
 * src/ui/BookCover.tsx
 *
 * 50x74 in lists, 44x64 in headers, 38x54 in docks, radius 5 to 6 with a drop shadow.
 * Never flat, never square.
 *
 * "No cover" is the common case, not the edge case, so the fallback is a first-class
 * path: a solid colour derived deterministically from the title, with the initial on
 * top. Deterministic matters — the same book must not change colour between renders or
 * between the list and the detail screen.
 */

import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { coverFallbacks, font, radius, size } from './theme'
import { useColors } from './useTheme'

type CoverSize = 'list' | 'header' | 'dock' | 'hero'

interface Props {
  title: string
  /** Local path wins over the remote URL: covers must survive offline. */
  localPath?: string | null
  url?: string | null
  /** Stored hex, if one was already derived. Falls back to deriving from the title. */
  color?: string | null
  size?: CoverSize
  style?: StyleProp<ViewStyle>
}

const DIMENSIONS: Record<CoverSize, { w: number; h: number }> = {
  list: size.coverList,
  header: size.coverHeader,
  dock: size.coverDock,
  hero: size.coverHero,
}

/** Deterministic, so a book never changes colour between the list and the detail screen. */
export function coverColorFor(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % coverFallbacks.length
  return coverFallbacks[index] ?? coverFallbacks[0]
}

export function BookCover({
  title,
  localPath,
  url,
  color,
  size: variant = 'list',
  style,
}: Props) {
  const c = useColors()
  const dims = DIMENSIONS[variant]
  const source = localPath ?? url ?? null

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Cover of ${title}`}
      style={[
        styles.base,
        {
          width: dims.w,
          height: dims.h,
          borderRadius: variant === 'hero' ? radius.coverLarge : radius.cover,
          backgroundColor: color ?? coverColorFor(title),
          shadowColor: c.ground,
        },
        style,
      ]}
    >
      {source ? (
        <Image
          source={{ uri: source }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          numberOfLines={1}
          style={{
            color: c.textSecondary,
            fontSize: variant === 'hero' ? font.title.size : font.bodyStrong.size,
            fontWeight: '700',
          }}
        >
          {title.trim().charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
})
