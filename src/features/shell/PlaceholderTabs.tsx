/**
 * The Add tab, as Slice 1 ships it: a real screen in the real shell, with an honest empty
 * state. Add is filled in Slice 4 (search, scan, manual entry). Stats moved to
 * `features/stats` in Slice 3, with the daily pace chart.
 */

import { nav } from '@/lib/strings'
import { EmptyState } from '@/ui/EmptyState'
import { Header } from '@/ui/Header'
import { Screen } from '@/ui/Screen'

export function AddScreen() {
  return (
    <Screen>
      <Header title={nav.add.title} />
      <EmptyState
        title="Search, scan or type it in"
        body="Finding books by title, ISBN or barcode is on its way. Everything you add will stay on this phone."
      />
    </Screen>
  )
}
