/**
 * src/ui/Notice.tsx
 *
 * A full-screen message that takes over: an icon in a rounded square, a centred title, a
 * paragraph, one action, and an optional footer line.
 *
 * Three screens in Slice 1 have exactly this shape — force update, migration failed, and
 * the error boundary — and they are the screens a reader sees on their worst day. Three
 * separate hand-built layouts would drift, and the one that drifted would be the one
 * nobody looked at twice because it only appears when something is already broken.
 *
 * The action uses the standard `Button` primary (h56 r18) from `Components.dc.html`
 * rather than the 48px button drawn on the Launch artboard. Where an artboard and the
 * component sheet disagree the sheet wins — it is the thing that keeps screen 30 looking
 * like screen 1. See DECISIONS.md, 2026-09-10.
 */

import { StyleSheet, Text, View } from 'react-native'

import { Button } from './Button'
import { Icon, type IconName } from './Icon'
import { Screen } from './Screen'
import { font, iconSize, iconStroke, radius, rules, size, space, typeStyle } from './theme'
import { useColors } from './useTheme'

interface Props {
  icon: IconName
  title: string
  body: string
  /** Omitted when there is genuinely nothing the reader can do from here. */
  actionLabel?: string
  onAction?: () => void
  busy?: boolean
  busyLabel?: string
  /** A second, lower-emphasis way out. */
  secondaryLabel?: string
  onSecondary?: () => void
  /** Small print pinned to the bottom, e.g. the version number. */
  footer?: string
  /** `centre` for a screen that is only this message. */
  glow?: 'centre' | 'upper'
}

export function Notice({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  busy = false,
  busyLabel,
  secondaryLabel,
  onSecondary,
  footer,
  glow = 'upper',
}: Props) {
  const c = useColors()

  return (
    <Screen glow={glow}>
      <View style={styles.wrap}>
        <View
          style={[styles.iconBox, { backgroundColor: c.surface, borderColor: c.borderStrong }]}
        >
          <Icon
            name={icon}
            size={iconSize.notice}
            color={c.accentInk}
            strokeWidth={iconStroke.notice}
          />
        </View>

        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.notice), styles.centred, { color: c.text }]}
        >
          {title}
        </Text>

        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.body), styles.centred, { color: c.textMuted }]}
        >
          {body}
        </Text>

        {actionLabel && onAction ? (
          <Button
            label={actionLabel}
            onPress={onAction}
            busy={busy}
            busyLabel={busyLabel}
            style={styles.action}
          />
        ) : null}

        {secondaryLabel && onSecondary ? (
          <Button
            label={secondaryLabel}
            onPress={onSecondary}
            variant="ghost"
            disabled={busy}
            style={styles.action}
          />
        ) : null}
      </View>

      {footer ? (
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.caption), styles.centred, { color: c.textMuted }]}
        >
          {footer}
        </Text>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  // `center` rather than `flex-start` so the message sits optically centred, and the
  // footer is pushed to the bottom by the Screen's own flex.
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.stackTight },
  iconBox: {
    width: size.noticeIcon,
    height: size.noticeIcon,
    borderRadius: radius.notice,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.cardTight,
  },
  centred: { textAlign: 'center' },
  // Full width: a centred action on a screen with no other choice should not be a small
  // target the reader has to aim at.
  action: { alignSelf: 'stretch', marginTop: space.cardTight },
})
