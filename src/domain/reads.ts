/**
 * src/domain/reads.ts
 *
 * Rules about a book's reads that more than one screen needs.
 */

import type { ReadStatus } from '@/db/schema'

/**
 * A re-read can start only once the current read has ended: finished, or abandoned.
 *
 * Starting one while the book is still being read, or has never been started, created a
 * second read in progress beside the first. The book then appeared twice on the Reading tab,
 * and its progress split across two rows that each claimed to be where the reader was.
 * Enforced in `startReread` as well as by hiding the action, so no caller can get it wrong.
 */
export function canStartReread(currentStatus: ReadStatus): boolean {
  return currentStatus === 'finished' || currentStatus === 'dnf'
}
