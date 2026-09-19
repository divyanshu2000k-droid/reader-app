/**
 * Asks for notification permission, AFTER explaining why — 04-SCREENS, Journey I.
 *
 * ─── WHY THERE IS A SCREEN IN FRONT OF THE SYSTEM PROMPT ─────────────────────
 *
 * Android's permission dialog can only be shown once. Tap "Don't allow" and it never appears
 * again; the reader has to find the app in Settings, which nobody does. So the expensive,
 * one-shot prompt is not spent until the reader has been told what it buys them.
 *
 * And the honest framing matters here. The notification is not a feature the app wants to
 * send them things through — it is **the thing that keeps the timer running**, because
 * Android kills a foreground service whose notification is gone. So the sheet says that,
 * rather than "stay updated".
 *
 * ─── AND WHY DECLINING IS FINE ───────────────────────────────────────────────
 *
 * "Not now" is a real answer, offered as an equal. The timer still works without it — the
 * numbers are derived from timestamps, so they stay right — the reader just gets the recovery
 * sheet more often, and the copy says exactly that rather than pretending the feature is
 * broken. Nagging is how an app earns a permanent denial.
 */

import * as Notifications from 'expo-notifications'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { primeDecision } from './primeDecision'
import { hasBeenAskedToNotify, rememberAskedToNotify } from './queries'
import { devLog } from '@/lib/devLog'
import { actions } from '@/lib/strings'
import { Button } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  visible: boolean
  /** Called once the reader has answered, whichever way. */
  onDone: () => void
}

export function NotificationPriming({ visible, onDone }: Props) {
  const c = useColors()
  const [asking, setAsking] = useState(false)

  async function ask() {
    setAsking(true)
    try {
      await Notifications.requestPermissionsAsync()
    } catch (cause) {
      // A refusal and a failure are the same outcome here: no permission, timer still works.
      devLog('notification permission request failed', { reason: String(cause) })
    }
    await rememberAskedToNotify()
    setAsking(false)
    onDone()
  }

  /** "Not now" is an answer, and is remembered as one. See `decline` in `shouldPrime`. */
  function decline() {
    void rememberAskedToNotify()
    onDone()
  }

  return (
    <Sheet visible={visible} onClose={decline} title="Keep the timer running">
      <View style={styles.block}>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.body), { color: c.textSecondary }]}
        >
          Android stops a timer when the app goes to the background, unless it can show a
          notification while it runs. That notification is how the timer stays alive — and it
          carries Pause and Finish, so you can stop without opening the app.
        </Text>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.secondary), { color: c.textMuted }]}
        >
          It is silent, and it is the only notification this app sends. Without it the timer
          still works — you will just be asked to confirm the time more often.
        </Text>
        <Button
          label="Allow notifications"
          busy={asking}
          busyLabel="Asking"
          onPress={() => void ask()}
        />
        <Button label={actions.notNow} variant="ghost" disabled={asking} onPress={decline} />
      </View>
    </Sheet>
  )
}

/**
 * Whether to prime before starting a timer. **At most once, ever.**
 *
 * Two questions, and both have to be no:
 *
 * 1. **Has Android already been asked?** Once the reader has answered the system prompt it
 *    will not appear again, so showing the explanation would be offering something this
 *    sheet can no longer deliver.
 * 2. **Have WE already asked?** This is the one that was missing, and it does not follow
 *    from the first. "Not now" is deliberately never passed to Android, so the permission
 *    stays `undetermined` and `canAskAgain` stays true — which meant this function kept
 *    saying yes, and the sheet came back on every new timer. Measured on a phone on
 *    2026-09-19: declined once, asked again on the very next timer.
 *
 * **The decision, 2026-09-19: asked once, never again**, and DECISIONS.md has the reasoning.
 * The copy already tells the reader exactly what declining costs them — more recovery
 * sheets, never a lost number — and Android's own Settings is the way back. The alternative
 * considered was asking again after the reader had actually met a recovery sheet, which is
 * better targeted and is still nagging.
 *
 * A failure to read either answer returns false: not asking is the safe direction, because
 * the cost of not asking is a recovery sheet and the cost of over-asking is a permanent
 * denial.
 */
export async function shouldPrime(): Promise<boolean> {
  try {
    const asked = await hasBeenAskedToNotify()
    const current = await Notifications.getPermissionsAsync()
    return primeDecision({
      askedBefore: asked,
      status: current.status,
      canAskAgain: current.canAskAgain,
    })
  } catch (cause) {
    devLog('notification permission check failed', { reason: String(cause) })
    return false
  }
}

const styles = StyleSheet.create({
  block: { gap: space.row },
})
