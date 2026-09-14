/**
 * "Which shelf?", from Moments.dc.html: tapping add on a search result had no destination.
 *
 * Start reading it now, Add to Want to read, I already finished it (04-SCREENS, Journey D).
 * "I already finished it" moves the book straight to Finished. The finish flow with its rating
 * and date is Slice 5's; until then no finish date is written that the reader did not choose.
 *
 * A failed add keeps the sheet open with the reason (the rule the actions sheet follows).
 */

import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { AddStatus } from '../bookForm'
import { resultDetail, type SearchResult } from '../searchMerge'
import type { AppError, Result } from '@/lib/result'
import { BookCover } from '@/ui/BookCover'
import { Button } from '@/ui/Button'
import { InlineError } from '@/ui/InlineError'
import { Sheet } from '@/ui/Sheet'
import { font, rules, space, typeStyle } from '@/ui/theme'
import { useColors } from '@/ui/useTheme'

const CHOICES: readonly { status: AddStatus; label: string; busy: string }[] = [
  { status: 'reading', label: 'Start reading it now', busy: 'Adding' },
  { status: 'want', label: 'Add to Want to read', busy: 'Adding' },
  { status: 'finished', label: 'I already finished it', busy: 'Adding' },
]

interface Props {
  result: SearchResult | null
  onClose: () => void
  onPick: (result: SearchResult, status: AddStatus) => Promise<Result<unknown>>
}

export function ShelfPickerSheet({ result, onClose, onPick }: Props) {
  const c = useColors()
  const [busy, setBusy] = useState<AddStatus | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [shown, setShown] = useState<SearchResult | null>(result)
  // Keep the last result on screen while the sheet animates away.
  if (result !== null && result !== shown) {
    setShown(result)
    setError(null)
  }

  async function pick(status: AddStatus) {
    if (!result || busy !== null) return
    setBusy(status)
    setError(null)
    const outcome = await onPick(result, status)
    setBusy(null)
    if (!outcome.ok) setError(outcome.error)
  }

  const detail = shown ? resultDetail(shown) : null
  return (
    <Sheet visible={result !== null} onClose={onClose} title="Which shelf?">
      {shown ? (
        <View style={styles.book}>
          <BookCover title={shown.title} url={shown.coverUrl} size="dock" />
          <View style={styles.text}>
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={rules.maxFontScale}
              style={[typeStyle(font.bodyStrong), { color: c.text }]}
            >
              {shown.title}
            </Text>
            {shown.authors.length > 0 || detail ? (
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={rules.maxFontScale}
                style={[typeStyle(font.secondary), { color: c.textMuted }]}
              >
                {[shown.authors.join(', '), detail].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {error ? <InlineError error={error} /> : null}
      {CHOICES.map((choice, i) => (
        <Button
          key={choice.status}
          label={choice.label}
          busyLabel={choice.busy}
          busy={busy === choice.status}
          disabled={busy !== null && busy !== choice.status}
          variant={i === 0 ? 'primary' : 'secondary'}
          onPress={() => void pick(choice.status)}
        />
      ))}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  book: { flexDirection: 'row', alignItems: 'center', gap: space.cardTight },
  text: { flex: 1, gap: space.labelGap },
})
