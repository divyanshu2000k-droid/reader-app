/**
 * +10, +25, +50 and Finished, from Session.dc.html: the end of a session without typing.
 *
 * Four chips in a row on a 360 dp screen is the tightest layout in the app (ui/Chip.tsx). They
 * wrap to a second line rather than shrink below the 44 px touch target. Finished appears only
 * when the book's length is known: a Finished chip that sets nothing is a control that lies.
 */

import { StyleSheet, View } from 'react-native'

import { Chip } from '@/ui/Chip'
import { space } from '@/ui/theme'

const STEPS = [10, 25, 50] as const

interface Props {
  unit: 'page' | 'minute'
  onAdd: (n: number) => void
  /** The book's last page or minute, or null when unknown. */
  end: number | null
  onFinish: () => void
}

export function QuickAddRow({ unit, onAdd, end, onFinish }: Props) {
  return (
    <View style={styles.row}>
      {STEPS.map((n) => (
        <Chip
          key={n}
          label={`+${n}`}
          accessibilityLabel={`Add ${n} ${unit}s`}
          onPress={() => onAdd(n)}
          style={styles.chip}
        />
      ))}
      {end !== null ? (
        <Chip
          label="Finished"
          accessibilityLabel={`Finished, ${unit} ${end}`}
          onPress={onFinish}
          style={styles.finish}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.row },
  chip: { flexGrow: 1 },
  finish: { flexGrow: 1.3 },
})
