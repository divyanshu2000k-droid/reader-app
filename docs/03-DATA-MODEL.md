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

### `shelves` and `book_shelves`

Free form tags, many to many. Not three hardcoded statuses. Users want mood shelves,
priority queues and series groupings.

`shelves`: `id`, `name`, `color`, `sort_order`, timestamps.
`book_shelves`: `book_id`, `shelf_id`, `added_at`. Composite PK.

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
| Pages read this year | `SUM(to_position - from_position)` where format is pages, grouped by year of `occurred_at` |
| Hours listened | Same over minutes, kept in a **separate column of the UI**, never summed with pages |
| Daily pace | Group sessions by `date(occurred_at)`. This only works because sessions carry real dates |
| Streak | Consecutive days having at least one session |
| Books finished | Count of reads with status finished in the year of `finished_at` |

**Pages and hours are never added together.** Three numbers on the Stats screen, always
separate. Audiobooks inflating page counts is the category's largest unmet complaint.

---

## Indexes

Add these from the first migration, not when it gets slow.

```sql
CREATE INDEX idx_reads_book       ON reads(book_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_read    ON sessions(read_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_date    ON sessions(occurred_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_books_title      ON books(title);
CREATE INDEX idx_books_isbn       ON books(isbn13);
CREATE INDEX idx_sync_queue       ON sync_queue(queued_at);
```

The `occurred_at` index carries every statistics query. It matters most.

---

## Sync rules

1. Local write commits to SQLite, returns immediately, appends to `sync_queue`
2. A background task drains the queue when there is network
3. Pull uses `updated_at > last_sync_at`, newer wins per row
4. Deletes propagate as `deleted_at` being set, never as row removal
5. A purge job removes rows with `deleted_at` older than 30 days, on both ends
6. `last_sync_at` lives in MMKV, not SQLite, so a database reset forces a full resync

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
| Restore | On migration failure, restore the newest backup, roll the schema version back, and report to Sentry |

Test every migration against a database seeded with 2000 books, and test the failure path
by deliberately corrupting a migration once.

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
- Pages and minutes summed into one number
- A re-read overwriting a previous read
- A hard delete
- Two devices generating the same ID
- Statistics that require a network call
