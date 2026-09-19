/**
 * The reading timer's ring, from `Reading.dc.html`.
 *
 * An SVG circle whose stroke is dashed with its own circumference, so `strokeDashoffset`
 * sweeps it from nothing to whole. Rotated -90° so it starts at twelve o'clock rather than
 * three, which is where the artboard starts it.
 *
 * **No Reanimated here, deliberately.** The ring moves once a second, driven by a re-render
 * the clock already causes. A worklet-driven animation would be a second source of truth for
 * the same number, and the number is the thing this product cannot get wrong.
 */

import Svg, { Circle } from 'react-native-svg'

import { iconStroke, size } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  /** 0 to 1. `timerState.ringFraction` decides what that means. */
  fraction: number
  /** The arc dims while paused: the ring says "running" without a word. */
  paused?: boolean
}

export function TimerRing({ fraction, paused = false }: Props) {
  const c = useColors()
  const swept = Math.max(0, Math.min(1, fraction))

  return (
    <Svg
      width={size.timerRing}
      height={size.timerRing}
      viewBox={`0 0 ${size.timerRing} ${size.timerRing}`}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Circle
        cx={size.timerRingCentre}
        cy={size.timerRingCentre}
        r={size.timerRingRadius}
        fill="none"
        stroke={c.border}
        strokeWidth={iconStroke.ringTrack}
      />
      <Circle
        cx={size.timerRingCentre}
        cy={size.timerRingCentre}
        r={size.timerRingRadius}
        fill="none"
        stroke={paused ? c.textMuted : c.accent}
        strokeWidth={iconStroke.ringProgress}
        strokeLinecap="round"
        strokeDasharray={size.timerRingCircumference}
        strokeDashoffset={size.timerRingCircumference * (1 - swept)}
        transform={`rotate(-90 ${size.timerRingCentre} ${size.timerRingCentre})`}
      />
    </Svg>
  )
}
