/**
 * The database could not be opened or migrated. Tier 3, with the retry Slice 0 lacked.
 *
 * Replaces a line of grey text on the placeholder screen. The retry is meaningful because
 * the restore path closes the database, so a second attempt reopens from disk — see
 * `retryMigrations` in db/migrate.ts.
 */

import { launch } from '@/lib/strings'
import { Notice } from '@/ui/Notice'

interface Props {
  /** What went wrong, from the migration's own AppError. */
  message: string
  retrying: boolean
  onRetry: () => void
}

export function MigrationFailed({ message, retrying, onRetry }: Props) {
  return (
    <Notice
      icon="alert"
      title={launch.migrationFailed.title}
      body={`${message}. ${launch.migrationFailed.body}`}
      actionLabel={launch.migrationFailed.action}
      busyLabel={launch.migrationFailed.busy}
      busy={retrying}
      onAction={onRetry}
    />
  )
}
