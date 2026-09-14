/**
 * src/ui/Icon.tsx
 *
 * Every icon in the app, as stroke paths lifted from the design files.
 *
 * One component rather than an icon library: the design uses a consistent 24-unit grid
 * with round caps and joins, and a library would bring a font or a few hundred glyphs to
 * draw the six shapes this app actually uses. It also keeps stroke colour flowing from
 * the theme instead of from a package's own defaults.
 *
 * Icons are decorative here — every control that carries one also carries an
 * `accessibilityLabel` — so they are marked so, and TalkBack skips straight to the label
 * rather than announcing a shape.
 */

import Svg, { Path, Circle } from 'react-native-svg'

import type { ColorValue } from 'react-native'

import { iconSize, iconStroke } from './theme'

export type IconName =
  | 'book'
  | 'plus'
  | 'chart'
  | 'settings'
  | 'download'
  | 'restore'
  | 'alert'
  | 'clock'
  | 'back'
  | 'more'
  | 'reread'
  | 'trash'
  | 'pencil'
  | 'chevron'
  | 'minus'
  | 'close'
  | 'search'
  | 'wifi'
  | 'image'
  | 'check'

interface Props {
  name: IconName
  size?: number
  color: ColorValue
  /** The design draws navigation icons at 1.9 and emphasis icons at 2.2 to 2.5. */
  strokeWidth?: number
}

export function Icon({
  name,
  size = iconSize.base,
  color,
  strokeWidth = iconStroke.base,
}: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {paths(name)}
    </Svg>
  )
}

function paths(name: IconName) {
  switch (name) {
    case 'book':
      return (
        <>
          <Path d="M4 5.5A2.5 2.5 0 016.5 3H19v16H6.5A2.5 2.5 0 004 21.5z" />
          <Path d="M9 7.5h6" />
        </>
      )
    case 'plus':
      return (
        <>
          <Path d="M12 5v14" />
          <Path d="M5 12h14" />
        </>
      )
    case 'chart':
      return <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    case 'settings':
      return (
        <>
          <Circle cx="12" cy="12" r="3" />
          <Path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.7 1.7 0 008 19.4a1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H2a2 2 0 110-4h.1A1.7 1.7 0 004.6 8a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V2a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H22a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
        </>
      )
    // The update screen's icon, straight from Launch.dc.html.
    case 'download':
      return (
        <>
          <Path d="M12 3v13" />
          <Path d="M7 11l5 5 5-5" />
          <Path d="M4 21h16" />
        </>
      )
    // The restore screen's icon, straight from Launch.dc.html.
    case 'restore':
      return (
        <>
          <Path d="M18 10a6 6 0 00-11.3-2A4.5 4.5 0 007 17h11a4 4 0 000-7z" />
          <Path d="M12 17v-5" />
          <Path d="M9.5 14.5L12 17l2.5-2.5" />
        </>
      )
    case 'alert':
      return (
        <>
          <Path d="M12 8v5" />
          <Path d="M12 16.5v.01" />
          <Circle cx="12" cy="12" r="9" />
        </>
      )
    case 'clock':
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M12 7.5V12l3 2" />
        </>
      )
    // Book detail's header, from BookDetail.dc.html.
    case 'back':
      return (
        <>
          <Path d="M19 12H5" />
          <Path d="M12 19l-7-7 7-7" />
        </>
      )
    case 'more':
      return (
        <>
          <Circle cx="12" cy="5" r="1" />
          <Circle cx="12" cy="12" r="1" />
          <Circle cx="12" cy="19" r="1" />
        </>
      )
    // The actions sheet, from BookActions.dc.html.
    case 'reread':
      return (
        <>
          <Path d="M3 12a9 9 0 109-9" />
          <Path d="M3 4v5h5" />
        </>
      )
    case 'trash':
      return (
        <>
          <Path d="M4 7h16" />
          <Path d="M6 7l1 13h10l1-13" />
          <Path d="M9 7V4h6v3" />
        </>
      )
    // Book detail's session rows, from BookDetail.dc.html.
    case 'pencil':
      return (
        <>
          <Path d="M12 20h9" />
          <Path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </>
      )
    // The logger's When row, from Session.dc.html.
    case 'chevron':
      return <Path d="M9 18l6-6-6-6" />
    // Session complete's page stepper and close, from SessionComplete.dc.html.
    case 'minus':
      return <Path d="M5 12h14" />
    case 'close':
      return (
        <>
          <Path d="M18 6L6 18" />
          <Path d="M6 6l12 12" />
        </>
      )
    // The search fields, from AddBook.dc.html and LibrarySearch.dc.html.
    case 'search':
      return (
        <>
          <Circle cx="11" cy="11" r="7" />
          <Path d="M20 20l-3.5-3.5" />
        </>
      )
    // The offline banner, from States.dc.html.
    case 'wifi':
      return (
        <>
          <Path d="M2 8.8a16 16 0 0120 0" />
          <Path d="M5 12.5a11 11 0 0114 0" />
          <Path d="M8.5 16a6 6 0 017 0" />
          <Path d="M12 20v.01" />
        </>
      )
    // The cover picker, from ManualEntry.dc.html.
    case 'image':
      return (
        <>
          <Path d="M5.5 4h13A2.5 2.5 0 0121 6.5v11a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5v-11A2.5 2.5 0 015.5 4z" />
          <Circle cx="8.5" cy="9.5" r="1.8" />
          <Path d="M21 15l-5-4-6 5" />
        </>
      )
    // Manual entry's reassurance line, from ManualEntry.dc.html.
    case 'check':
      return (
        <>
          <Path d="M9 12l2 2 4-4" />
          <Circle cx="12" cy="12" r="9" />
        </>
      )
  }
}
