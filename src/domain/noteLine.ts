/**
 * src/domain/noteLine.ts
 *
 * HOW A BOOK'S NOTES ARE DESCRIBED IN WORDS. Pure.
 *
 * In `domain/` because two features say it and features may not import from one another
 * (06-CONVENTIONS): the notes list says it in its header, and book detail's actions sheet
 * says it on the Notes row. Said in two places, it has to be said the same way — "6 notes ·
 * 3 quotes" in one and "6 notes and 3 quotes" in the other is drift nobody notices
 * individually and everybody feels.
 *
 * The counts themselves come from `db/noteCounts.ts`, which is the shared SQL.
 */

import type { NoteCounts } from '@/db/noteCounts'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * "6 notes · 3 quotes", leaving out whichever is zero, and empty when the book has neither.
 *
 * The empty string is the caller showing its empty state instead, never "0 notes · 0 quotes":
 * a zero invites the reader to wonder what happened to theirs.
 */
export function countsLine(counts: NoteCounts): string {
  const parts: string[] = []
  if (counts.notes > 0) parts.push(plural(counts.notes, 'note', 'notes'))
  if (counts.quotes > 0) parts.push(plural(counts.quotes, 'quote', 'quotes'))
  return parts.join(' · ')
}
