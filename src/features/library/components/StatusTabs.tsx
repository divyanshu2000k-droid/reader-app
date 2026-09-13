/**
 * src/features/library/components/StatusTabs.tsx
 *
 * The Library's filter chips, from `Main.dc.html`: Reading, Want, Finished, DNF.
 *
 * These are `reads.status`, not the free-form `shelves` table. Status is where a book is in
 * its lifecycle; shelves are the reader's own organisation, and the shelf filter arrives
 * with the slice that first creates shelves (03-DATA-MODEL, `shelves`).
 *
 * Horizontally scrollable, because four chips at 200% font scale do not fit a 360px screen
 * and clipping the last one would hide DNF entirely.
 */

import { ScrollView, StyleSheet } from 'react-native'

import type { ReadStatus } from '@/db/schema'
import { status as statusCopy } from '@/lib/strings'
import { Chip } from '@/ui/Chip'
import { space } from '@/ui/theme'

export const STATUS_ORDER: readonly ReadStatus[] = ['reading', 'want', 'finished', 'dnf']

interface Props {
  value: ReadStatus
  onChange: (status: ReadStatus) => void
}

export function StatusTabs({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {STATUS_ORDER.map((s) => (
        <Chip
          key={s}
          label={statusCopy[s]}
          selected={s === value}
          accessibilityLabel={`${statusCopy[s]} books`}
          onPress={() => onChange(s)}
        />
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { gap: space.row, paddingRight: space.screen },
})
