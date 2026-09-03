/**
 * src/db/seed.ts
 *
 * Slice 0's acceptance criterion: insert a book with a read and three sessions.
 *
 * Deliberately goes through `writeRow`, not through raw inserts. If the seed could
 * bypass the write path, the write path would not be the only one.
 *
 * Runs on a device only. Call it from a dev-only button, never in production.
 */

import { writeRow } from './write'
import { now, toLocalDay } from '@/lib/dates'
import { newId } from '@/lib/ids'
import type { Result } from '@/lib/result'

const DAY_MS = 24 * 60 * 60 * 1000

export async function seedSampleLibrary(): Promise<Result<{ bookId: string }>> {
  const ts = now()
  const bookId = newId()
  const readId = newId()

  const book = await writeRow('books', {
    id: bookId,
    title: 'The Overstory',
    author: 'Richard Powers',
    pageCount: 502,
    source: 'manual',
    createdAt: ts,
    updatedAt: ts,
  })
  if (!book.ok) return book

  const read = await writeRow('reads', {
    id: readId,
    bookId,
    status: 'reading',
    readNumber: 1,
    // Left NULL deliberately: started_at is computed from MIN(session date) until the
    // reader overrides it. Never write a computed value into these columns.
    startedAt: null,
    finishedAt: null,
    createdAt: ts,
    updatedAt: ts,
  })
  if (!read.ok) return read

  // Three sessions, deliberately back-dated, including one audiobook sitting. This is
  // the shape that proves the thesis: mixed formats on one read, real dates, and a
  // local_day per session.
  const plan = [
    { daysAgo: 4, format: 'pages' as const, from: 0, to: 62 },
    { daysAgo: 2, format: 'minutes' as const, from: 0, to: 48 },
    { daysAgo: 0, format: 'pages' as const, from: 62, to: 118 },
  ]

  for (const p of plan) {
    const occurredAt = ts - p.daysAgo * DAY_MS
    const result = await writeRow('sessions', {
      id: newId(),
      readId,
      occurredAt,
      // Written together with occurredAt, always. See DECISIONS.md.
      localDay: toLocalDay(occurredAt),
      format: p.format,
      fromPosition: p.from,
      toPosition: p.to,
      isTimed: 0,
      createdAt: ts,
      updatedAt: ts,
    })
    if (!result.ok) return result
  }

  return { ok: true, value: { bookId } }
}
