/**
 * src/features/trash/deletedLine.ts
 *
 * WHAT ONE ROW OF RECENTLY DELETED SAYS. Pure, so every kind of deleted thing is asserted
 * rather than seen on whichever one happened to be deleted while looking.
 *
 * Each row has to answer one question: **is this the thing I want back?** A book has its
 * title and cover. A session and a note do not, so each is named by what it was AND which
 * book it was for — "28 pages · 184 → 212" alone cannot tell two deleted sessions apart, and
 * a note's first words alone cannot tell two quotes from the same book apart.
 */

import type { DeletedItem } from './queries'
import { sessionLine } from '@/domain/sessionLine'

/** A note is recognised by its opening words, not by the whole thing. */
export const NOTE_PREVIEW = 80

export interface DeletedLine {
  readonly title: string
  readonly detail: string
}

function preview(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  // The ellipsis is part of the promise: a row that silently ends mid-sentence reads as a
  // note that was saved mid-sentence.
  return flat.length <= NOTE_PREVIEW ? flat : `${flat.slice(0, NOTE_PREVIEW).trimEnd()}…`
}

/**
 * `removed` and `when` arrive already formatted by `lib/dates.ts`: nothing here parses or
 * formats a date, so this module is the same in every timezone.
 */
export function deletedLine(
  item: DeletedItem,
  formatted: { readonly removed: string; readonly when: string },
): DeletedLine {
  if (item.kind === 'book') {
    return { title: item.title, detail: `Removed ${formatted.removed}` }
  }
  if (item.kind === 'note') {
    const kind = item.type === 'quote' ? 'Quote' : 'Note'
    const page = item.page === null ? '' : `, p.${item.page}`
    return {
      title: preview(item.content),
      detail: `${kind}${page} from ${item.bookTitle} · deleted ${formatted.removed}`,
    }
  }
  return {
    title: sessionLine(item).amount,
    detail: `${item.bookTitle} · ${formatted.when} · deleted ${formatted.removed}`,
  }
}
