# DATA MODEL

This is the most important document in the folder. Every distinctive feature the product
has depends on getting this right, and it is the single most expensive thing to change
later. Read it twice.

---

## The central insight

Every competitor models a book as a row with `date_started` and `date_finished`. That one
modelling error produces four separate user complaints that look unrelated:

- StoryGraph credits every page to the finish date, destroying daily pace charts
- Fable cannot change a start date once you are mid book
- Imports lose dates and cannot be repaired afterwards
- Re-reads overwrite the original read

They are one bug wearing four costumes. **A reading life is not a book with two dates. It
is a stream of dated events.** Model it that way and all four become impossible to write.

```
book                 the work itself. Metadata only, no dates, no progress.
 └── read            one pass through it. A book can have many.
      └── session    one sitting. Carries its own editable date and its own format.
```

---

## Schema

SQLite locally, Postgres remotely, same shape. Drizzle definitions live in
`src/db/schema.ts`.

**Every enum-ish column below carries its union through `.$type<T>()`,** and the unions
are declared at the top of `schema.ts` as the single source:

| Column | Type |
|---|---|
| `books.source` | `BookSource` — `google` · `openlibrary` · `manual` · `import` |
| `reads.status` | `ReadStatus` — `want` · `reading` · `finished` · `dnf` |
| `sessions.format` | `SessionFormat` — `pages` · `minutes` |
| `notes.type` | `NoteType` — `quote` · `note` |
| `sync_queue.operation` | `SyncOperation` — `upsert` · `delete` |

This is not decoration. Without `.$type<>()` these infer as `string`, so a row read from
the database is **not assignable** to the domain type that describes it — `Session` would
not satisfy `ProgressSession` — and the fix at the call site is always a cast. Twelve
`queries.ts` files casting rows into domain types is how a `format` of `"Pages"` from a
bad import reaches the statistics code. A parallel hand-written union beside a bare
`text()` column is the duplicate `06-CONVENTIONS.md` forbids; the column IS the type.

### `books`

The work. Contains no progress and no dates, deliberately.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Client generated UUID |
| `title` | TEXT NOT NULL | |
| `author` | TEXT | Nullable. Never render "Unknown", render nothing |
| `isbn13` | TEXT | Nullable, indexed |
| `isbn10` | TEXT | Nullable |
| `page_count` | INTEGER | Nullable. User editable and frequently wrong from APIs |
| `total_minutes` | INTEGER | Audiobook length. Nullable |
| `cover_url` | TEXT | Remote URL |
| `cover_local_path` | TEXT | Downloaded copy. Covers must survive offline |
| `cover_color` | TEXT | Hex fallback derived from the title when there is no cover |
| `publisher` | TEXT | |
| `published_year` | INTEGER | |
| `source` | TEXT | `google` · `openlibrary` · `manual` · `import` |
| `source_id` | TEXT | The upstream id, for refresh |
| `created_at` | INTEGER | Unix ms, UTC |
| `updated_at` | INTEGER | Unix ms, UTC. Drives sync |
| `deleted_at` | INTEGER | Soft delete. NULL means live |

Every metadata field is user editable. This is a product requirement, not a nicety.

### `reads`

One pass through a book. This table is what makes re-reads work.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `book_id` | TEXT FK | → books.id |
| `status` | TEXT NOT NULL | `want` · `reading` · `finished` · `dnf` |
| `rating` | REAL | 0.5 to 5.0 in 0.5 steps. Nullable |
| `review` | TEXT | Nullable |
| `is_private` | INTEGER | Default 1 |
| `started_at` | INTEGER | **Nullable stored override.** See the rule below |
| `finished_at` | INTEGER | **Nullable stored override.** Same rule |
| `read_number` | INTEGER | 1 for first read, 2 for second, and so on |
| `created_at` / `updated_at` / `deleted_at` | INTEGER | |

**The override rule, and it applies to both date columns.** When the column is NULL, the
UI computes and displays `MIN(sessions.occurred_at)` for started, `MAX` for finished. When
it is set, the stored value wins. **Never write a computed value into the column**, because
then you cannot distinguish a user's deliberate choice from a cached calculation. This
matters when they later add an earlier session.

A book with three reads has three rows here, each with its own rating and dates. Nothing
overwrites anything. `dnf` is a first class status and pages read on a DNF still count.

### `sessions`

The atom of the whole system. Append only in practice, always editable in principle.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `read_id` | TEXT FK | → reads.id |
| `occurred_at` | INTEGER NOT NULL | **The single most important column in the schema** |
| `local_day` | TEXT NOT NULL | `YYYY-MM-DD`. The calendar day in the device's timezone at write time. Indexed. See below |
| `format` | TEXT NOT NULL | `pages` or `minutes`. Lives here, not on the book |
| `from_position` | INTEGER | Page or minute started at |
| `to_position` | INTEGER | Page or minute ended at |
| `duration_seconds` | INTEGER | Nullable. Only set for timed sessions |
| `is_timed` | INTEGER | 1 if from the timer, 0 if manually logged |
| `note` | TEXT | Optional quick thought |
| `created_at` / `updated_at` / `deleted_at` | INTEGER | |

**`occurred_at` defaults to now and is never locked.** Editable before saving, after
saving, and on imported rows. This one column is the fix for four competitor bugs.

**`format` on the session, not the book,** is what lets one book hold both print and audio
without double counting. It is the top voted unshipped request on StoryGraph's public
roadmap.

**`local_day` is a deliberate stored derivation, and the one exception to the rule below.**
`occurred_at` is UTC, so `date(occurred_at)` in SQL yields a **UTC** day. In IST that files
every session before 05:30 into the previous day; in US timezones it files every evening
session into the next one. Streaks, the daily pace chart and yearly totals would all be
quietly wrong at the boundary, which is the exact failure the product thesis rests on not
having. So the calendar day is computed once, at write time, from the device timezone.

Three rules, and they are the whole contract:

1. **`local_day` is written whenever `occurred_at` is written, and never otherwise.** Insert
   and any edit of the date recompute it from the new `occurred_at` in the *current* device
   timezone. Editing a note or a page count does not touch it.
2. **Every day-bucketed aggregate reads `local_day`.** Streaks, daily pace, "today",
   grouping by month or year for charts. Never `date(occurred_at)`, anywhere.
3. **A timezone change does not rewrite existing rows.** The session happened on that day
   for that reader. See `DECISIONS.md`.

`occurred_at` remains the sort key and the source of truth for the instant. `local_day` is
the bucket. They are written together and must never disagree.

### `shelves` and `book_shelves`

Free form tags, many to many. Not three hardcoded statuses. Users want mood shelves,
priority queues and series groupings.

`shelves`: `id`, `name`, `color`, `sort_order`, timestamps.
`book_shelves`: `id` (UUID PK), `book_id`, `shelf_id`, `added_at`, and the full
`created_at` / `updated_at` / `deleted_at` set, plus
`UNIQUE (book_id, shelf_id) WHERE deleted_at IS NULL`.

**NOT a composite primary key, though that is the tidier relational answer.** A composite
key leaves nowhere to put `deleted_at`, which would make a shelf assignment the only row
in the app that cannot be soft-deleted, and therefore the only destructive action with no
undo — breaking a non-negotiable rule to save one column. It also broke the write path
outright: the table was registered as syncable, so `writeRow` would have emitted
`onConflictDoUpdate` against a nonexistent `id` and `softDelete` would have set a column
that did not exist, crashing on the first shelf assignment in Slice 2.

The partial unique index buys back exactly what the composite key was for: one live
assignment per book-and-shelf pair, while still allowing the pair to be re-added after a
soft delete.

Note that `status` on `reads` and shelves are different things. Status is where a book is
in its lifecycle; shelves are the user's own organisation.

### `notes`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `book_id` | TEXT FK | Attached to the book, not the read, so notes survive re-reads |
| `read_id` | TEXT FK | Nullable, for provenance |
| `type` | TEXT | `quote` or `note` |
| `content` | TEXT NOT NULL | |
| `page` | INTEGER | Nullable |
| `image_path` | TEXT | For scanned pages |
| `created_at` / `updated_at` / `deleted_at` | INTEGER | |

### `goals`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `year` | INTEGER | |
| `target_books` | INTEGER | Nullable, goals are optional |
| timestamps | INTEGER | |

Pages and hours are always tracked whether or not a goal exists. Never gate statistics
behind setting a target.

### `sync_queue`

Local only. Never syncs.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | Local ordering only |
| `table_name` | TEXT | |
| `row_id` | TEXT | |
| `operation` | TEXT | `upsert` or `delete` |
| `queued_at` | INTEGER | |
| `attempts` | INTEGER | Back off after repeated failures |

### `metadata_cache`

Search results cached permanently so a book in the library never needs the network again.
Keyed by source and source id, with the raw JSON payload and a fetch timestamp.

**Relationship to `books`:** this table is a cache of *search results*, not of library
books. When a user adds a book, the relevant fields are copied into `books` and that copy
is authoritative from then on. Refreshing metadata later never overwrites a field the user
has edited. Local only, never syncs.

---

## Derived values, never stored

Compute these with SQL. Storing them means they drift.

| Value | How |
|---|---|
| Current page | `MAX(to_position)` over sessions where format is pages |
| Percent complete | current page ÷ `books.page_count` |
| Pages read this year | `SUM(to_position - from_position)` where format is pages, grouped by `substr(local_day, 1, 4)` |
| Hours listened | Same over minutes, kept in a **separate column of the UI**, never summed with pages |
| Daily pace | Group sessions by `local_day`. This only works because sessions carry real dates |
| Streak | Consecutive `local_day` values having at least one session |
| Books finished | Count of reads with status finished in the year of `finished_at` |

Every row above that buckets by day or year uses `local_day`, never `date(occurred_at)`.
`local_day` is the one stored derivation in the schema and the reasoning is directly above.

**Pages and hours are never added together.** Three numbers on the Stats screen, always
separate. Audiobooks inflating page counts is the category's largest unmet complaint.

---

## Indexes

Add these from the first migration, not when it gets slow.

```sql
CREATE INDEX idx_reads_book       ON reads(book_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reads_status     ON reads(status)  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_reads_book_number
                                  ON reads(book_id, read_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_read    ON sessions(read_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_date    ON sessions(occurred_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_day     ON sessions(local_day)   WHERE deleted_at IS NULL;
CREATE INDEX idx_books_title      ON books(title)   WHERE deleted_at IS NULL;
CREATE INDEX idx_books_isbn       ON books(isbn13)  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_book_shelves_pair
                                  ON book_shelves(book_id, shelf_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_book_shelves_book ON book_shelves(book_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_book       ON notes(book_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sync_queue       ON sync_queue(queued_at);
```

**Every index on a soft-deletable table is partial.** The two on `books` were not, which
meant the index the library list scans carried every book the reader had ever deleted.
`idx_reads_status` exists because the library list filters on status before anything
else. `idx_reads_book_number` is unique and partial: one live read number per book, and a
deleted read frees its number to be re-used, exactly like the `book_shelves` pair index.

The `local_day` index carries every statistics query, because every day-bucketed aggregate
groups on it. It matters most. The `occurred_at` index carries ordering within a day and
the session list on book detail.

---

## What a delete takes with it

Deleting is soft everywhere, and **a soft delete cascades to the rows that belong to the
deleted row**, in the same transaction, each with its own `sync_queue` entry.

| Deleting a | also soft-deletes |
|---|---|
| `book` | its `reads`, their `sessions`, its `notes`, its `book_shelves` |
| `read` | its `sessions` |
| `shelf` | its `book_shelves` |

**Why, and it is not obvious.** The alternative — setting `deleted_at` on the book and
leaving its sessions live — is what the code shipped with. It means every statistic keeps
counting a book the reader deleted: their yearly pages include a book that is no longer in
their library, and there is no screen on which that number can be explained. A reader who
cannot reconcile a total against their own data stops trusting every total, which is
precisely the failure this product exists to avoid. The alternative fix, "remember to
filter on the parent's `deleted_at`" in every one of a dozen `queries.ts` files, is the
same losing strategy as "remember to enqueue".

**How restore knows what to undo.** Every row in one cascade is stamped with the *same*
`deleted_at`, and restoring the parent clears only children carrying that exact timestamp.
A session the reader deleted separately last week has a different timestamp and stays
deleted — undoing "remove this book" must not resurrect something they meant to throw
away.

**The cost, accepted deliberately.** Deleting a book with 500 sessions writes 500 queue
rows. That is correct: every one of those rows genuinely has to reach the server. It is
one transaction, so the reader still sees one atomic, undoable action.

Enforced in `src/db/write.ts` and nowhere else. A `queries.ts` file cannot delete.

---

## Sync rules

1. Local write commits to SQLite, returns immediately, appends to `sync_queue`. **The write
   and the enqueue are one transaction. Both or neither.** There is no other write path
2. A background task drains the queue when there is network
3. **`updated_at` is stamped by Postgres on push, never by the client.** The server value is
   written back to the local row when the push succeeds. The client's own `updated_at` is an
   optimistic placeholder and is never the conflict arbiter, because a phone with a wrong
   clock would otherwise win or lose every conflict forever. See `DECISIONS.md`
4. Pull uses `updated_at > last_sync_at`, newer wins per row, **except** that a row with a
   pending entry in `sync_queue` is skipped. The un-pushed local edit is the newer one and
   will become authoritative on the next drain
5. Deletes propagate as `deleted_at` being set, never as row removal
6. A purge job removes rows with `deleted_at` older than 30 days, on both ends
7. `last_sync_at` lives in MMKV, not SQLite, so a database reset forces a full resync.
   It stores a **server** timestamp, taken from the pull response, never a local clock read

Row Level Security on Postgres: every table gets a `user_id` and a policy restricting all
operations to `auth.uid() = user_id`. Four lines of SQL replaces an entire API layer.

---

## Migrations

Drizzle migration files, checked into git, numbered, never edited after being shipped.

### Backup before migration, specified

"Back up first" is too vague to implement, and getting it wrong is one of the few ways to
violate the never-lose-data directive. Concretely:

| Question | Answer |
|---|---|
| What | File copy of the SQLite database via `expo-file-system` |
| Where | App-internal storage, `FileSystem.documentDirectory + 'backups/'`. Not user visible, not in a folder the OS may clear |
| Naming | `reader-<schemaVersion>-<unixMs>.db` |
| Retention | Keep the newest three. Delete older ones **after** a successful migration, never before |
| Free space | Check available space first. Require at least 3x the database size. If unavailable, **block the migration** and surface a clear message |
| If backup fails | **Fail closed.** Do not migrate. An app on an old schema still works; an app with a half-migrated database may not |
| Restore | On migration failure, restore the newest backup **that this build can read**, roll the schema version back, and report to Sentry |

**Never restore a backup from a newer schema than the running code.** The version is in
the filename and `restoreNewestBackup(currentSchemaVersion)` takes the newest at or below
it. After a rollback to an older build — a halted staged release, a reinstalled older APK
— the newest backup on disk is from a schema this binary has never seen, and restoring it
hands the app a database with columns it cannot read: a worse state than the failed
migration being rolled back, arrived at in the one code path whose entire job is not
losing data.

**Three implementation facts that are not optional, each found the hard way on a device:**

1. **Checkpoint the WAL before copying, and copy the `-wal` and `-shm` sidecars too.**
   `journal_mode = WAL` means a committed transaction can live entirely in `reader.db-wal`
   until a checkpoint, so a plain copy of `reader.db` alone can be missing the reader's
   most recent sessions. Measured on device: `wal 263712B → 0B` across a checkpoint, main
   file unchanged. A bare copy would have missed 263 KB of committed data — and it looks
   like success, which is worse than no backup at all.
2. **Close the database before restoring.** On Android, deleting an open file does not
   affect the already-open descriptor: SQLite stays attached to the now-unlinked inode, so
   copying a backup into that path has no effect on the running app and later writes go to
   the orphaned inode and are lost at exit. Without `closeDatabase()` the restore silently
   does nothing **while reporting success**, in the code path that then tells the reader
   "your library was restored from a backup taken moments ago".
3. **Clear the live sidecars before copying the backup's in.** A stale `reader.db-wal`
   beside a restored database is replayed on next open and can reintroduce exactly the
   half-migrated state being rolled back.

Test every migration against a database seeded with 2000 books, and test the failure path
by deliberately corrupting a migration once. There is no `{ name: 'none' }` success
sentinel: a backup attempt returns `made` or `skipped`, so "no backup exists" cannot be
mistaken for "a backup exists".

---

## Import mapping

A Goodreads CSV row becomes:

- One `books` row, from title, author, ISBN, page count
- One `reads` row, with status mapped from the shelf, plus rating and review
- **Zero `sessions` rows.** Goodreads does not export reading progress and we do not
  fabricate it

Date handling, which is where every competitor fails:

- `Date Read` present → `reads.finished_at`
- `Date Added` present → `reads.started_at` only if no better signal exists
- Neither present → flag the row for user resolution in the preview screen
- **Never invent a date.** A null date is honest; a wrong one corrupts statistics forever

The preview screen exists precisely so ambiguous rows get resolved by a human before
anything is written. Nothing is committed to the database until the user confirms.

---

## Export format

Export is promised in three places and is a trust feature, so it must round trip.

**JSON** is the full relational structure using the same field names as this schema:
books, each with nested reads, each with nested sessions, plus notes and shelves.

**CSV** is Goodreads compatible for portability, plus a second `sessions.csv` because
Goodreads has no equivalent.

**Write the importer for your own JSON format in the same slice as the exporter.** Round
tripping your own data is the only way to know the export actually works.

---

## Things that must be impossible

If any of these can happen, the model is wrong:

- A session without a date
- A date that cannot be edited
- A session without a `local_day`, or a `local_day` that disagrees with its `occurred_at`
- A day bucket computed from `date(occurred_at)` rather than `local_day`
- Pages and minutes summed into one number
- A re-read overwriting a previous read
- A hard delete
- Two devices generating the same ID
- A local write that reaches SQLite without reaching `sync_queue`
- A live session belonging to a deleted read, or a live read belonging to a deleted book
- An update that rewrites a row's `created_at`
- A device clock deciding which side of a conflict wins
- Statistics that require a network call
