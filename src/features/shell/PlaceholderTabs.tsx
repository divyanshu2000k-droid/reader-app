/**
 * The Add and Stats tabs, as Slice 1 ships them: real screens in the real shell, so the
 * tab bar and navigation are exercised end to end, each with an honest empty state.
 *
 * Add is filled in Slice 2 (search, scan, manual entry) and Stats in Slice 7. Neither
 * pretends to have content it does not.
 */

import { empty, nav } from '@/lib/strings'
import { EmptyState } from '@/ui/EmptyState'
import { Header } from '@/ui/Header'
import { Screen } from '@/ui/Screen'

export function AddScreen() {
  return (
    <Screen>
      <Header title={nav.add.title} />
      <EmptyState
        title="Search, scan or type it in"
        body="Finding books by title, ISBN or barcode arrives in the next update. Everything you add stays on this phone."
      />
    </Screen>
  )
}

export function StatsScreen() {
  return (
    <Screen>
      <Header title={nav.stats.title} />
      <EmptyState title={empty.stats.title} body={empty.stats.body} />
    </Screen>
  )
}
