/**
 * Gate 2: a timed session was still running when the app died. Never silently discard.
 *
 * The sheet cannot be dismissed by back or by tapping the scrim — the reader must choose.
 * If the choice fails to save, the sheet STAYS, with an error, rather than closing and
 * leaving the session open to be asked about again with no explanation.
 */

import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { discardOpenSession, keepOpenSession, type OpenSession } from '../queries'
import { formatDuration, now } from '@/lib/dates'
import { launch } from '@/lib/strings'
import { BookCover } from '@/ui/BookCover'
import { Button } from '@/ui/Button'
import { Screen } from '@/ui/Screen'
import { Sheet } from '@/ui/Sheet'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  session: OpenSession
  onResolved: () => void
}

export function SessionRecoverySheet({ session, onResolved }: Props) {
  const c = useColors()
  const [busy, setBusy] = useState<'keep' | 'discard' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Measured once, when the sheet appears: the time the reader is being asked about
  // should not keep growing while they read the question.
  const elapsedSeconds = useMemo(
    () => Math.max(0, (now() - session.occurredAt) / 1000),
    [session.occurredAt],
  )

  async function choose(which: 'keep' | 'discard') {
    setBusy(which)
    setError(null)
    const result =
      which === 'keep'
        ? await keepOpenSession(session.id, elapsedSeconds)
        : await discardOpenSession(session.id)
    setBusy(null)
    if (result.ok) onResolved()
    else setError(`${result.error.message}. ${result.error.safe ?? ''}`.trim())
  }

  return (
    <Screen glow="none">
      <Sheet visible dismissable={false} onClose={() => undefined}>
        <View style={styles.book}>
          <BookCover
            title={session.bookTitle}
            localPath={session.coverLocalPath}
            url={session.coverUrl}
            color={session.coverColor}
            size="dock"
          />
          <View style={styles.bookText}>
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.bodyStrong), { color: c.text }]}
            >
              {session.bookTitle}
            </Text>
            {session.bookAuthor ? (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.secondary), { color: c.textMuted }]}
              >
                {session.bookAuthor}
              </Text>
            ) : null}
          </View>
        </View>

        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.heading), { color: c.text }]}
        >
          {launch.sessionRecovery.title(formatDuration(elapsedSeconds))}
        </Text>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.body), { color: c.textMuted }]}
        >
          {launch.sessionRecovery.body}
        </Text>

        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={rules.maxFontScale}
            style={[typeStyle(font.label), { color: c.danger }]}
          >
            {error}
          </Text>
        ) : null}

        <Button
          label={launch.sessionRecovery.save}
          busy={busy === 'keep'}
          disabled={busy !== null}
          onPress={() => void choose('keep')}
        />
        <Button
          label={launch.sessionRecovery.discard}
          variant="ghost"
          busy={busy === 'discard'}
          disabled={busy !== null}
          onPress={() => void choose('discard')}
        />
      </Sheet>
    </Screen>
  )
}

const styles = StyleSheet.create({
  book: { flexDirection: 'row', alignItems: 'center', gap: space.rowWide },
  bookText: { flex: 1, gap: space.labelGap },
})
