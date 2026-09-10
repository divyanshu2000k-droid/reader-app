/**
 * The Library tab. Slice 1 ships it empty — the done condition is "launches to an empty
 * Library" — with the header and its Settings entry point. Slice 2 fills the list.
 *
 * Settings lives in this header rather than in the tab bar, per the build plan. The
 * design's header shows search and a shelf filter; both arrive with the list in Slice 2
 * and sit beside this button. See DECISIONS.md, 2026-09-10.
 */

import { useRouter } from 'expo-router'

import { empty } from '@/lib/strings'
import { EmptyState } from '@/ui/EmptyState'
import { Header, HeaderIconButton } from '@/ui/Header'
import { Screen } from '@/ui/Screen'

export function LibraryScreen() {
  const router = useRouter()
  return (
    <Screen>
      <Header
        title="The library"
        right={
          <HeaderIconButton
            icon="settings"
            accessibilityLabel="Settings"
            onPress={() => router.push('/settings')}
          />
        }
      />
      <EmptyState
        title={empty.library.title}
        body={empty.library.body}
        actionLabel={empty.library.action}
        onAction={() => router.navigate('/add')}
      />
    </Screen>
  )
}
