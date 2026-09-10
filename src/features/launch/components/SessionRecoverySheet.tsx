/**
 * Gate 2: a timed session was still running when the app died. Never silently discard.
 *
 * The sheet cannot be dismissed by back or by tapping the scrim — the reader must choose.
 * If the choice fails to save, the sheet STAYS, with an error, rather than closing and
 * leaving the session open to be asked about again with no explanation.
 *
 * NEVER INVENT A DURATION. The app knows when the session started and nothing about when
 * the reader stopped. The elapsed time is the most they can have read; within a cap it is
 * pre-filled for them to correct, past it the field starts empty and they are asked. Save
 * writes only a number the reader has seen. The rule is in recoveryPolicy.ts, with tests.
 */

import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { discardOpenSession, keepOpenSession, type OpenSession } from '../queries'
import { checkMinutes, recoveryOffer } from '../recoveryPolicy'
import { formatDuration, now } from '@/lib/dates'
import { launch } from '@/lib/strings'
import { BookCover } from '@/ui/BookCover'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Screen } from '@/ui/Screen'
import { Sheet } from '@/ui/Sheet'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

interface Props {
  session: OpenSession
  onResolved: () => void
}

const copy = launch.sessionRecovery

export function SessionRecoverySheet({ session, onResolved }: Props) {
  const c = useColors()
  const [busy, setBusy] = useState<'keep' | 'discard' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Measured once, when the sheet appears: the bound should not keep growing while the
  // reader is answering the question.
  const elapsedSeconds = useMemo(
    () => (now() - session.occurredAt) / 1000,
    [session.occurredAt],
  )
  const offer = useMemo(() => recoveryOffer(elapsedSeconds), [elapsedSeconds])
  const [minutesText, setMinutesText] = useState(
    offer.suggestedMinutes === null ? '' : String(offer.suggestedMinutes),
  )

  const check = checkMinutes(minutesText, offer.maxMinutes)
  // An empty field is not an error, it is a question not yet answered: Save stays
  // disabled, and the body copy already says what to type.
  const fieldError = check.ok
    ? undefined
    : check.reason === 'empty'
      ? undefined
      : check.reason === 'tooLong'
        ? copy.invalid.tooLong(offer.maxMinutes)
        : copy.invalid[check.reason]

  async function choose(which: 'keep' | 'discard') {
    if (which === 'keep' && !check.ok) return
    setBusy(which)
    setError(null)
    const result =
      which === 'keep' && check.ok
        ? await keepOpenSession(session.id, check.minutes * 60)
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
          {copy.title}
        </Text>
        <Text
          maxFontSizeMultiplier={rules.maxFontScale}
          style={[typeStyle(font.body), { color: c.textMuted }]}
        >
          {/* From the FLOORED bound, not the raw elapsed time: formatDuration rounds, so
              540.7 minutes read "9h 1m" here while the field refused anything over 540. */}
          {copy.started(formatDuration(offer.maxMinutes * 60))}{' '}
          {offer.suggestedMinutes === null ? copy.asked : copy.offered}
        </Text>

        <Field
          label={copy.field}
          value={minutesText}
          onChangeText={setMinutesText}
          keyboardType="number-pad"
          error={fieldError}
        />

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
          label={copy.save}
          busy={busy === 'keep'}
          disabled={busy !== null || !check.ok}
          onPress={() => void choose('keep')}
        />
        <Button
          label={copy.discard}
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
