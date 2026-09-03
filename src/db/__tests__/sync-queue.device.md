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
