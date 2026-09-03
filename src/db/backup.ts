/**
 * src/db/backup.ts
 *
 * Backup before every migration. "Back up first" is too vague to implement, so the
 * contract is spelled out in docs/03-DATA-MODEL.md and implemented here exactly:
 *
 *   What       file copy of the SQLite database
 *   Where      app-internal storage, not user visible, not a folder the OS may clear
 *   Naming     reader-<schemaVersion>-<unixMs>.db
 *   Retention  keep the newest three, deleted AFTER a successful migration, never before
 *   Space      require 3x the database size, otherwise BLOCK the migration
 *   On failure FAIL CLOSED. An app on an old schema still works; a half-migrated one
 *              may not.
 */

import { Directory, File, Paths } from 'expo-file-system'

import { DATABASE_NAME } from './client'
import { appError, attempt, err, ok, type Result } from '@/lib/result'

const BACKUP_DIR = 'backups'
const KEEP_NEWEST = 3
/** Require this multiple of the database size in free space before migrating. */
const FREE_SPACE_FACTOR = 3

function backupsDirectory(): Directory {
  return new Directory(Paths.document, BACKUP_DIR)
}

function databaseFile(): File {
  // expo-sqlite keeps databases under the document directory's SQLite folder.
  return new File(Paths.document, 'SQLite', DATABASE_NAME)
}

export interface BackupInfo {
  readonly name: string
  readonly uri: string
  readonly createdAt: number
}

export function listBackups(): BackupInfo[] {
  const dir = backupsDirectory()
  if (!dir.exists) return []
  return dir
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.db'))
    .map((f) => ({
      name: f.name,
      uri: f.uri,
      // reader-<version>-<unixMs>.db
      createdAt: Number(f.name.replace(/\.db$/, '').split('-').pop() ?? 0),
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Copy the database aside before migrating.
 *
 * Returns an error rather than throwing so the caller can fail closed explicitly. There
 * is no path here that migrates anyway.
 */
export async function backupBeforeMigration(schemaVersion: number): Promise<Result<BackupInfo>> {
  const source = databaseFile()

  // A database that does not exist yet is a fresh install. Nothing to lose, nothing to
  // back up, and blocking the first migration would be absurd.
  if (!source.exists) {
    return ok({ name: 'none', uri: '', createdAt: Date.now() })
  }

  const dbSize = source.size ?? 0
  const free = Paths.availableDiskSpace
  if (free !== null && free < dbSize * FREE_SPACE_FACTOR) {
    return err(
      appError(
        'unrecoverable',
        'Not enough free space to update safely',
        {
          safe: 'Your library has not been changed. Free up some space and reopen the app.',
        },
      ),
    )
  }

  return attempt(
    async () => {
      const dir = backupsDirectory()
      if (!dir.exists) dir.create({ intermediates: true })
      const name = `reader-${schemaVersion}-${Date.now()}.db`
      const target = new File(dir, name)
      source.copy(target)
      return { name, uri: target.uri, createdAt: Date.now() }
    },
    (cause) =>
      appError('unrecoverable', 'Could not back up your library before updating', {
        safe: 'Nothing was changed. Your library is exactly as it was.',
        cause,
      }),
  )
}

/**
 * Delete all but the newest three. Called ONLY after a migration succeeds, never
 * before: a pruned backup during a failed migration is the exact scenario the whole
 * mechanism exists to prevent.
 */
export function pruneBackups(): void {
  const stale = listBackups().slice(KEEP_NEWEST)
  for (const b of stale) {
    try {
      new File(b.uri).delete()
    } catch {
      // A backup that will not delete is harmless. Never fail a successful migration
      // over housekeeping.
    }
  }
}

/** Restore the newest backup over the live database. Used when a migration fails. */
export function restoreNewestBackup(): Result<void> {
  const newest = listBackups()[0]
  if (!newest || !newest.uri) {
    return err(
      appError('unrecoverable', 'No backup available to restore', {
        safe: 'Your database was not modified.',
      }),
    )
  }
  try {
    const target = databaseFile()
    if (target.exists) target.delete()
    new File(newest.uri).copy(target)
    return ok(undefined)
  } catch (cause) {
    return err(appError('unrecoverable', 'Could not restore the backup', { cause }))
  }
}
