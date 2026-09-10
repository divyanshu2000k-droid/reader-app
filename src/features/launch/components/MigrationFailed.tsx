/**
 * The database could not be opened or migrated. Tier 3, with a retry.
 *
 * The body is the failure's own two lines: what happened, and what is still safe plus
 * the next step. It used to show only the message followed by a fixed "this usually
 * clears on a second try", which threw away the one line that mattered when the cause was
 * a full phone ("free up about 40 MB") and told that reader to do something that could
 * never work. The fixed copy is now only a fallback for a failure that carries no `safe`.
 *
 * A retry reopens the connection and re-plans from disk — see `retryMigrations` in
 * db/migrate.ts — so after freeing space, Try again genuinely gets through.
 */

import type { MigrationFailure } from '@/db/migrate'
import { launch } from '@/lib/strings'
import { Notice } from '@/ui/Notice'

interface Props {
  error: MigrationFailure
  retrying: boolean
  onRetry: () => void
}

export function MigrationFailed({ error, retrying, onRetry }: Props) {
  return (
    <Notice
      icon="alert"
      title={launch.migrationFailed.title}
      body={`${error.message}. ${error.safe ?? launch.migrationFailed.body}`}
      actionLabel={launch.migrationFailed.action}
      busyLabel={launch.migrationFailed.busy}
      busy={retrying}
      onAction={onRetry}
    />
  )
}
