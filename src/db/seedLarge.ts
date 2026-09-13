/**
 * src/db/seedLarge.ts
 *
 * A LIBRARY AT SCALE, for the three Slice 2 requirements that only mean anything together:
 * the 60fps scroll budget, migrations against a populated database, and FlashList tuning.
 *
 * DEV ONLY, AND ONLY ON THE SANDBOX DATABASE. It writes thousands of rows, and a tool that
 * writes thousands of rows must not be able to point at the reader's library: see
 * `usesSandboxDatabase` in lib/config.ts. Run the app with `EXPO_PUBLIC_SANDBOX_DB=1`.
 *
 * It goes through `writeBatch`, so every row still gets its `sync_queue` entry, its parent
 * check and its derived `local_day` — the same write path the app uses. Seeding by raw
 * insert would be faster and would prove nothing about the code that ships.
 *
 * ─── WHAT "REALISTIC" MEANS HERE ─────────────────────────────────────────────
 *
 * The shapes are chosen to be the ones that break screens, not the ones that flatter them:
 *   - **A quarter of print books have no page count.** Missing page counts are the median
 *     case from the metadata APIs, so "page 212 of 502" is the exception, not the rule.
 *   - **Audiobooks have no page count at all**, and their sessions are minutes.
 *   - **Some books have two reads**, so previous reads and `read_number` are exercised.
 *   - **Long titles and long author names**, because a 360px row is where they break.
 *   - **A few books with no author**, which must render as nothing rather than "Unknown".
 *   - **Sessions chain**: each starts where the last finished, so positions are boundaries
 *     (see 03-DATA-MODEL) and the totals add up to the position reached.
 *   - **Some sessions are timed** and carry a duration, so hours-read has data.
 *
 * Deterministic: the same seed number produces the same ids, titles and shapes, with dates
 * at the same distances from the day it runs. It refuses to seed a sandbox that already has
 * books, and a small plan with chosen statuses exists for empty-tab and small-library checks.
 */

import { isNull, sql } from 'drizzle-orm'

import { getDb } from './client'
import { books } from './schema'
import { usesSandboxDatabase } from '@/lib/config'
import { now } from '@/lib/dates'
import { appError, err, ok, type Result } from '@/lib/result'
import type { ReadStatus, SessionFormat } from './schema'
import { writeBatch, type RowFor } from './write'

export interface LargeSeedCounts {
  readonly books: number
  readonly reads: number
  readonly sessions: number
  readonly shelves: number
  readonly assignments: number
  readonly ms: number
}

export interface LargeSeedPlan {
  readonly books: number
  /**
   * Any integer. The same number yields the same ids, titles, authors, statuses and shapes.
   * Dates are relative to the day it runs, so they are the same distances from "now".
   */
  readonly seed: number
  /** Draw only from these statuses, uniformly. Unset: the realistic weighted mix. */
  readonly statuses?: readonly ReadStatus[]
}

const DEFAULT_PLAN: LargeSeedPlan = { books: 2000, seed: 20260912 }

const DAY = 24 * 60 * 60 * 1000

/** Deterministic PRNG. `Math.random()` would make every measurement unrepeatable. */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = [
  'Quiet',
  'The Long',
  'A Short',
  'Winter',
  'The Last',
  'Salt',
  'The Glass',
  'Northern',
  'Small',
  'The Bright',
  'Paper',
  'The Hollow',
  'Late',
  'The Silent',
  'Amber',
]
const SECOND = [
  'House',
  'Light',
  'Garden',
  'Machine',
  'Country',
  'Hours',
  'Orchard',
  'River',
  'Winter',
  'Animals',
  'Cities',
  'Wolves',
  'Letters',
  'Harvest',
  'Distance',
]
const THIRD = [
  '',
  ' of the North',
  ' and Other Stories',
  ' in Translation',
  ': A Memoir',
  ' of Small Things',
  '',
  '',
  ' Revisited',
  '',
]
const GIVEN = [
  'Aoife',
  'Marguerite',
  'Tomás',
  'Ngozi',
  'Hiroko',
  'Bernardine',
  'Kazuo',
  'Elif',
  'Anne',
  'Colm',
  'Yaa',
  'Sally',
  'Olga',
  'Haruki',
  'Zadie',
]
const FAMILY = [
  'Ní Dhomhnaill',
  'Yourcenar',
  'Ó Súilleabháin',
  'Adichie',
  'Ogawa',
  'Evaristo',
  'Ishiguro',
  'Shafak',
  'Carson',
  'Tóibín',
  'Gyasi',
  'Rooney',
  'Tokarczuk',
  'Murakami',
  'Smith',
]
const SHELF_NAMES = [
  'Favourites',
  'To buy',
  'Book club',
  'Summer reading',
  'Re-read someday',
  'Borrowed',
]

/**
 * A v4-shaped UUID from the seeded generator. The app's `newId()` is random, so every run's
 * ids differed, which is what made the old "deterministic" claim untrue.
 */
function seededId(rnd: () => number): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(rnd() * 16)
    return (ch === 'x' ? r : (r % 4) + 8).toString(16)
  })
}

/** Weighted status draw: most of a real library is finished or waiting, not in progress. */
function pickStatus(r: number): ReadStatus {
  if (r < 0.06) return 'reading'
  if (r < 0.42) return 'want'
  if (r < 0.94) return 'finished'
  return 'dnf'
}

export async function seedLargeLibrary(
  plan: Partial<LargeSeedPlan> = {},
): Promise<Result<LargeSeedCounts>> {
  if (!usesSandboxDatabase) {
    return err(
      appError('recoverable', 'Refusing to seed the real library', {
        safe: 'Nothing was written. Restart with EXPO_PUBLIC_SANDBOX_DB=1, which opens a separate database.',
      }),
    )
  }

  // Never on top of an existing library: a second tap doubled the sandbox to 4000 books, and
  // every measurement after that described a library nobody seeded on purpose.
  const existing = await getDb()
    .select({ one: sql<number>`1` })
    .from(books)
    .where(isNull(books.deletedAt))
    .limit(1)
  if (existing.length > 0) {
    return err(
      appError('recoverable', 'This sandbox already has books', {
        safe: 'Nothing was written. Seeding twice would double the library.',
      }),
    )
  }

  const { books: bookCount, seed, statuses } = { ...DEFAULT_PLAN, ...plan }
  const rnd = mulberry32(seed)
  const drawStatus = (r: number): ReadStatus =>
    statuses && statuses.length > 0
      ? (statuses[Math.floor(r * statuses.length)] ?? 'want')
      : pickStatus(r)
  const started = now()
  const nowMs = now()

  const bookRows: RowFor<'books'>[] = []
  const readRows: RowFor<'reads'>[] = []
  const sessionRows: RowFor<'sessions'>[] = []
  const shelfRows: RowFor<'shelves'>[] = []
  const assignmentRows: RowFor<'book_shelves'>[] = []

  for (const [i, name] of SHELF_NAMES.entries()) {
    shelfRows.push({ id: seededId(rnd), name, color: null, sortOrder: i })
  }

  for (let i = 0; i < bookCount; i += 1) {
    const bookId = seededId(rnd)
    const isAudio = rnd() < 0.12
    const longTitle = rnd() < 0.08
    const title =
      `${FIRST[Math.floor(rnd() * FIRST.length)]} ${SECOND[Math.floor(rnd() * SECOND.length)]}` +
      `${THIRD[Math.floor(rnd() * THIRD.length)]}` +
      (longTitle ? ' and the Remarkable Difficulty of Fitting a Title Into One Row' : '')
    const hasAuthor = rnd() > 0.03
    const author = hasAuthor
      ? `${GIVEN[Math.floor(rnd() * GIVEN.length)]} ${FAMILY[Math.floor(rnd() * FAMILY.length)]}`
      : null
    // A quarter of print books have no page count: the median case from the APIs.
    const pageCount = isAudio ? null : rnd() < 0.25 ? null : 180 + Math.floor(rnd() * 600)
    const totalMinutes = isAudio ? 240 + Math.floor(rnd() * 900) : null

    bookRows.push({
      id: bookId,
      title,
      author,
      isbn13: null,
      isbn10: null,
      pageCount,
      totalMinutes,
      coverUrl: null,
      coverLocalPath: null,
      coverColor: null,
      publisher: null,
      publishedYear: 1950 + Math.floor(rnd() * 76),
      source: 'import',
      sourceId: null,
    })

    for (const shelf of shelfRows) {
      if (rnd() < 0.06) {
        assignmentRows.push({ id: seededId(rnd), bookId, shelfId: shelf.id, addedAt: nowMs })
      }
    }

    // A few books have been read twice, so previous reads and read_number are real.
    const readCount = rnd() < 0.07 ? 2 : 1
    for (let n = 1; n <= readCount; n += 1) {
      const readId = seededId(rnd)
      const isCurrent = n === readCount
      const status: ReadStatus = isCurrent ? drawStatus(rnd()) : 'finished'
      const rating = status === 'finished' && rnd() < 0.7 ? Math.ceil(rnd() * 10) / 2 : null
      readRows.push({
        id: readId,
        bookId,
        status,
        rating,
        review: null,
        isPrivate: 1,
        // Never a computed value: the UI derives these from the sessions.
        startedAt: null,
        finishedAt: status === 'finished' ? nowMs - Math.floor(rnd() * 700) * DAY : null,
        readNumber: n,
      })

      if (status === 'want') continue

      const format: SessionFormat = isAudio ? 'minutes' : 'pages'
      const total = isAudio ? (totalMinutes ?? 600) : (pageCount ?? 320)
      const sessionCount = 2 + Math.floor(rnd() * (status === 'finished' ? 14 : 8))
      // Finished reads reach the end; a read in progress stops partway.
      const reach = status === 'finished' ? total : Math.floor(total * (0.1 + rnd() * 0.6))
      const step = Math.max(1, Math.floor(reach / sessionCount))
      let position = 0
      // Oldest first, each strictly later than the last and all before now. The first version
      // clamped a day counter at zero, which stacked several sessions on one timestamp; the
      // phone showed them in an arbitrary, backwards-looking order.
      let at = nowMs - (1 + Math.floor(rnd() * 500)) * DAY
      for (let s = 0; s < sessionCount; s += 1) {
        at += (6 + Math.floor(rnd() * 60)) * 60 * 60 * 1000
        const occurredAt = Math.min(at, nowMs - (sessionCount - s) * 60 * 1000)
        const from = position
        const to = s === sessionCount - 1 ? reach : Math.min(reach, position + step)
        position = to
        const timed = rnd() < 0.35
        sessionRows.push({
          id: seededId(rnd),
          readId,
          occurredAt,
          format,
          fromPosition: from,
          toPosition: to,
          // A timed session knows how long the reader read; a logged one does not.
          durationSeconds: timed ? (5 + Math.floor(rnd() * 70)) * 60 : null,
          isTimed: timed ? 1 : 0,
          note: null,
        })
      }
    }
  }

  // Order matters: a parent must exist and be live before its child is written, and
  // `writeBatch` checks that for every row.
  const batches: [string, () => Promise<Result<{ written: number }>>][] = [
    ['books', () => writeBatch('books', bookRows)],
    ['shelves', () => writeBatch('shelves', shelfRows)],
    ['reads', () => writeBatch('reads', readRows)],
    ['sessions', () => writeBatch('sessions', sessionRows)],
    ['book_shelves', () => writeBatch('book_shelves', assignmentRows)],
  ]
  for (const [label, run] of batches) {
    const result = await run()
    if (!result.ok) {
      return err(
        appError('recoverable', `Could not seed ${label}`, {
          safe: result.error.safe,
          cause: result.error.cause,
        }),
      )
    }
  }

  return ok({
    books: bookRows.length,
    reads: readRows.length,
    sessions: sessionRows.length,
    shelves: shelfRows.length,
    assignments: assignmentRows.length,
    ms: now() - started,
  })
}
