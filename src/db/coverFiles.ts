/**
 * src/db/coverFiles.ts
 *
 * A LOCAL COPY OF EVERY COVER. "Covers must survive offline" (03-DATA-MODEL, `books`), and
 * "a searched book stays fully usable offline afterwards" is Slice 4's done-when.
 *
 * A book added from search stores the remote `cover_url` at once and downloads the image in
 * the background into the app's own documents, then records `cover_local_path`. `BookCover`
 * already tries the local file first, then the URL, then the initial (ui/coverSource.ts), so a
 * cover that has not downloaded yet still shows while online, and one that has shows offline.
 *
 * Best effort, never blocking: adding a book never waits for, or fails because of, its cover.
 * A download that did not happen (offline when added, a server error) is tried again when the
 * book is next opened, while online (`ensureLocalCover`). Each book is attempted at most once
 * per launch, so an unreachable cover is not re-fetched on every render.
 */

import { Directory, File, Paths } from 'expo-file-system'

import { updateRow } from './write'

const COVERS_DIR = 'covers'
const attempted = new Set<string>()

function coversDirectory(): Directory {
  return new Directory(Paths.document, COVERS_DIR)
}

/** Named by the book, so a re-download replaces rather than piles up. */
export function coverFileName(bookId: string): string {
  return `${bookId}.jpg`
}

/**
 * Download `url` for `bookId` and record the local path. Resolves to the local URI, or null if
 * it could not be done now. Never throws.
 */
export async function ensureLocalCover(
  bookId: string,
  url: string | null,
): Promise<string | null> {
  if (url === null || attempted.has(bookId)) return null
  attempted.add(bookId)
  try {
    const dir = coversDirectory()
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
    const target = new File(dir, coverFileName(bookId))
    const file = await File.downloadFileAsync(url, target, { idempotent: true })
    // A redirect to an error page, or an empty body, is not a cover.
    if (!file.exists || (file.size ?? 0) === 0) return null
    const saved = await updateRow('books', bookId, { coverLocalPath: file.uri })
    return saved.ok ? file.uri : null
  } catch {
    // Offline, a 404, a full disk: the remote URL and the initial still stand in.
    return null
  }
}
