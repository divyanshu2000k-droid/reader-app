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

import { checkpointWal, closeDatabase, DATABASE_NAME } from './client'
import { appError, attempt, err, ok, type Result } from '@/lib/result'

const BACKUP_DIR = 'backups'
const KEEP_NEWEST = 3
/** Require this multiple of the database size in free space before migrating. */
const FREE_SPACE_FACTOR = 3

/**
 * The sidecar files WAL mode creates. `-wal` holds committed transactions that have not
 * yet been folded into the main file; `-shm` is its shared-memory index.
 */
const WAL_SUFFIXES = ['-wal', '-shm'] as const

function backupsDirectory(): Directory {
  return new Directory(Paths.document, BACKUP_DIR)
}

function databaseFile(): File {
  // expo-sqlite keeps databases under the document directory's SQLite folder.
  return new File(Paths.document, 'SQLite', DATABASE_NAME)
}

function sidecarFile(suffix: string): File {
  return new File(Paths.document, 'SQLite', `${DATABASE_NAME}${suffix}`)
}

export interface BackupInfo {
  readonly name: string
  readonly uri: string
  readonly createdAt: number
  /**
   * The schema version the database was on when this copy was taken. Parsed from the
   * filename, and load-bearing: see `restoreNewestBackup`.
   */
  readonly schemaVersion: number
}

/**
 * What a backup attempt did.
 *
 * This used to be `Result<BackupInfo>` with a `{ name: 'none', uri: '' }` sentinel for
 * the fresh-install case, and `restoreNewestBackup` had a matching `!uri` check. A
 * sentinel like that is a second outcome smuggled through the success branch: every
 * caller has to know the magic value, and the one that forgets treats "no backup exists"
 * as "a backup exists". Naming the two outcomes makes forgetting a compile error.
 */
export type BackupOutcome =
  | { readonly kind: 'made'; readonly backup: BackupInfo }
  | { readonly kind: 'skipped'; readonly reason: 'no database yet' }

/** `reader-<schemaVersion>-<unixMs>.db`, and nothing else counts as a backup. */
const BACKUP_NAME = /^reader-(\d+)-(\d+)\.db$/

/** Narrows the regex result so the caller can index it without a cast. */
function assertBackupName(
  match: RegExpExecArray | null,
  name: string,
): asserts match is RegExpExecArray {
  if (!match) throw new Error(`backup name does not match the naming contract: ${name}`)
}

export function listBackups(): BackupInfo[] {
  const dir = backupsDirectory()
  if (!dir.exists) return []
  return dir
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .flatMap((f) => {
      // Anything that does not match the naming contract is not a backup this code
      // wrote, and guessing at its version or its age is worse than ignoring it.
      const parts = BACKUP_NAME.exec(f.name)
      if (!parts?.[1] || !parts[2]) return []
      return [
        {
          name: f.name,
          uri: f.uri,
          schemaVersion: Number(parts[1]),
          createdAt: Number(parts[2]),
        },
      ]
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Copy the database aside before migrating.
 *
 * Returns an error rather than throwing so the caller can fail closed explicitly. There
 * is no path here that migrates anyway.
 */
export async function backupBeforeMigration(
  schemaVersion: number,
): Promise<Result<BackupOutcome>> {
  const source = databaseFile()

  // A database that does not exist yet is a fresh install. Nothing to lose, nothing to
  // back up, and blocking the first migration would be absurd. Reported as its own
  // outcome rather than as a fake backup.
  if (!source.exists) {
    return ok({ kind: 'skipped', reason: 'no database yet' })
  }

  const dbSize = source.size ?? 0
  const free = Paths.availableDiskSpace
  if (free !== null && free < dbSize * FREE_SPACE_FACTOR) {
    return err(
      appError('unrecoverable', 'Not enough free space to update safely', {
        safe: 'Your library has not been changed. Free up some space and reopen the app.',
      }),
    )
  }

  return attempt(
    async () => {
      const dir = backupsDirectory()
      if (!dir.exists) dir.create({ intermediates: true })
      const name = `reader-${schemaVersion}-${Date.now()}.db`
      const target = new File(dir, name)

      // BELT. Fold the write-ahead log into the main file first. Without this, a copy of
      // `reader.db` alone can be missing every transaction still sitting in
      // `reader.db-wal` — plausibly the reader's most recent sessions. Copying an
      // incomplete backup is worse than not backing up, because it looks like success.
      checkpointWal()

      source.copy(target)

      // BRACES. A checkpoint can be partial if another connection holds a read lock, so
      // copy the sidecars too. If they are present at restore time SQLite replays them;
      // if the checkpoint was clean they are empty and harmless.
      for (const suffix of WAL_SUFFIXES) {
        const sidecar = sidecarFile(suffix)
        if (sidecar.exists) sidecar.copy(new File(dir, `${name}${suffix}`))
      }

      const made = BACKUP_NAME.exec(name)
      // The name is built two lines up, so a mismatch means the naming contract and its
      // parser have drifted apart — which would silently make every later backup
      // invisible to listBackups. Fail here, where it is obvious.
      assertBackupName(made, name)

      return {
        kind: 'made',
        backup: { name, uri: target.uri, createdAt: Number(made[2]), schemaVersion },
      }
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
    // The sidecars go with their database. Leaving an orphaned `-wal` behind would make
    // a later restore replay a log belonging to a different backup.
    for (const path of [b.uri, ...WAL_SUFFIXES.map((s) => `${b.uri}${s}`)]) {
      try {
        const f = new File(path)
        if (f.exists) f.delete()
      } catch {
        // A backup that will not delete is harmless. Never fail a successful migration
        // over housekeeping.
      }
    }
  }
}

/**
 * Restore the newest USABLE backup over the live database. Used when a migration fails.
 *
 * NEVER RESTORES A BACKUP FROM A NEWER SCHEMA THAN THE RUNNING CODE.
 *
 * The version has always been in the filename and used to be ignored: the newest file by
 * timestamp won outright. After a rollback to an older build — a staged release halted,
 * or a reader reinstalling an older APK — the newest backup on disk is from a schema this
 * binary has never seen, and restoring it hands the app a database with columns it cannot
 * read. That is a worse state than the failed migration it was rolling back, and it
 * happens in exactly the situation where the reader is already having a bad day.
 *
 * Clears the live sidecars before copying: a stale `reader.db-wal` left beside a
 * restored database would be replayed on the next open and could reintroduce exactly
 * the half-migrated state being rolled back.
 */
export function restoreNewestBackup(currentSchemaVersion: number): Result<void> {
  const all = listBackups()
  const newest = all.find((b) => b.schemaVersion <= currentSchemaVersion)
  if (!newest) {
    const tooNew = all.length > 0
    return err(
      appError(
        'unrecoverable',
        tooNew ? 'No backup this version can read' : 'No backup available to restore',
        {
          safe: 'Your database was not modified.',
        },
      ),
    )
  }

  try {
    // Close first. Deleting an open file on Android leaves the connection attached to
    // the unlinked inode, so without this the copy lands on disk and the running app
    // never sees it — the restore silently does nothing while reporting success. The
    // device pass caught exactly that. The next getDb() reopens from the restored file.
    closeDatabase()

    const target = databaseFile()
    if (target.exists) target.delete()
    for (const suffix of WAL_SUFFIXES) {
      const live = sidecarFile(suffix)
      if (live.exists) live.delete()
    }

    new File(newest.uri).copy(target)

    for (const suffix of WAL_SUFFIXES) {
      const saved = new File(`${newest.uri}${suffix}`)
      if (saved.exists) saved.copy(sidecarFile(suffix))
    }

    return ok(undefined)
  } catch (cause) {
    return err(appError('unrecoverable', 'Could not restore the backup', { cause }))
  }
}
