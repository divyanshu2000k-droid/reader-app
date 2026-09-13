# The behavioural half of the no-bypass proof

`no-bypass.test.ts` is the source guard: it fails the moment anyone writes a direct
`db.insert` outside `src/db/write.ts`. It runs in Node in milliseconds and catches the
mistake at authorship time.

It cannot prove that the enqueue actually happens, or that it is genuinely atomic. That
needs a real SQLite connection, which needs a device. These are the checks to run in
Slice 0's device pass, once `npx expo run:android` works.

## 1. Every write leaves exactly one queue row

For each syncable table, write a row through the public query API and assert:

- exactly one `sync_queue` row exists for it
- its `table_name` matches the table
- its `row_id` matches the row's UUID
- its `operation` is `upsert` for a create or update, `delete` for a soft delete

Then soft-delete the row and assert a second queue entry appears with `operation`
`delete`, and that the table row still exists with `deleted_at` set. A hard delete here
is a bug: deletes are soft everywhere, no exceptions.

## 2. The write and the enqueue are one transaction

This is the half that matters and the half that is easy to skip.

Force the `sync_queue` insert to fail — temporarily rename the table, or add a
constraint it violates — then attempt a write through `writeRow`. Assert:

- the call returns a `Result` with `ok: false`
- **the table row was not inserted**

If the row is there and the queue entry is not, the two statements are not actually
atomic, they merely both usually succeed. That failure mode is invisible until a reader
loses data, which is why it gets its own test rather than a comment.

## 3. Local-only tables never enqueue

Write to `metadata_cache` and assert `sync_queue` is unchanged. It is a cache of search
results, not user data, and syncing it would push thousands of useless rows.

## 4. Seeding leaves a clean trail

Run `seedSampleLibrary()` on an empty database and assert:

- one book, one read, three sessions
- five `sync_queue` rows, one per written row
- each session's `local_day` matches its `occurred_at` rendered in the device timezone
- `reads.started_at` is still NULL, because the seed must never write a computed value
  into an override column

## 5. Backup, against its real assumptions

`backup.ts` has the most logic and the least execution in the codebase, so the pass
exercises it rather than reasoning about it. Assert on a device:

- `Paths.availableDiskSpace` returns a real number, so the 3x free-space guard guards
  something
- the database really is at `files/SQLite/reader.db`, the path the code assumes
- a `-wal` sidecar exists and `checkpointWal()` actually drains it, so a bare copy of
  `reader.db` would have lost committed data
- the backup carries both sidecars, and prune keeps exactly three with no orphans

## 6. Restore, in both directions

**6.** After restoring, a row written _after_ the backup is gone and a row written before
it survives. This is what proves `closeDatabase()` is doing its job: on Android, deleting
an open file leaves the connection on the unlinked inode, so without it the restore
silently does nothing while reporting success.

**6b.** Given a compatible backup **and** a more recent one stamped with a newer schema
version, restore must choose the compatible one. A version-blind restore takes the newest
file and hands the app a database it cannot read — the state a rollback lands in, which is
worse than the failed migration being rolled back.

## 7. Cleanup, which is also the cascade test

The pass soft-deletes everything it created, including the seeded book, and then asserts
there are **no live reads under a deleted book and no live sessions under a deleted read**.

That assertion is the soft-delete cascade's behavioural test. It also keeps the counts
honest: cleanup once matched only `Devcheck%`, so every run left the seeded book, its read
and its three sessions behind, and the next run's seed added three more. A device pass
that grows the database it is checking produces numbers that stop meaning anything.

## 8. `local_day` follows `occurred_at`, and only it

A session's day is derived on insert. A write that leaves the instant alone never moves it,
whether that write is a note edit, a same-instant `updateRow` or a same-instant upsert.
Each is checked against a planted day from "another timezone". Moving the instant moves the
day through both write paths. A patch of only `undefined` values changes nothing, leaves
`updated_at` untouched and queues nothing.

## 9. Restore undoes exactly its cascade, and never orphans a row

**9a.** Delete one session on its own, then delete its book. Restoring the book brings back
the book, read, other session, note and shelf assignment, with one upsert each. The session
deleted separately stays deleted. Both directions, because either one failing is a wrong
statistic.
**9b.** A book deleted, then its shelf deleted, then the book restored: the assignment to
the deleted shelf stays deleted.
**9c.** Restoring a session whose read is deleted is refused. The refusal says to restore
the parent first, and it queues nothing.
**9d.** Writing a session under a deleted read, or moving one there, is refused.
**9e.** Undoing the delete of read #1 after a new read #1 exists is refused with "clashes",
not an opaque failure.

## What a migration needs on top of all this

Every check above runs against whatever schema the app is on. **None of them tests an
upgrade.** A migration must additionally be run against a POPULATED database of the
previous schema — see the procedure in `docs/09-ENVIRONMENT.md`. Migration `0001` passed
every check on this page and still could not run on a real reader's database.
