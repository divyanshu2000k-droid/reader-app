--> HAND-EDITED AFTER GENERATION. See DECISIONS.md, 2026-09-19.
--> drizzle-kit emitted only the ALTER TABLE and the CREATE UNIQUE INDEX at the bottom.
--> Nothing in v3 prevented two LIVE goals for the same year, so real databases can hold
--> that shape, and against one of them the bare index fails outright:
-->     UNIQUE constraint failed: goals.year
--> A migration that fails is not a safe no-op here. The app fails closed and stays on the
--> old schema FOREVER, retrying a doomed migration on every launch, with no path out.
--> That is silent-pass item 5, and it has already happened once, to 0001.
-->
--> Slice 7 is the slice that WRITES goals, so this is the last moment the constraint is
--> free. The repair below runs first.

ALTER TABLE `books` ADD `genre` text;--> statement-breakpoint
-- STEP 1, and it must come first: enqueue the rows that are ABOUT to change, while they
-- are still identifiable. A repaired row is a changed row and syncs like any other write;
-- skipping this leaves the server holding duplicates we have just resolved locally, and
-- the next pull would hand them straight back. Selecting them afterwards is not possible,
-- because the repair is what erases the evidence.
INSERT INTO sync_queue (table_name, row_id, operation, queued_at, attempts)
SELECT 'goals', id, 'upsert', CAST(strftime('%s','now') AS INTEGER) * 1000, 0
FROM goals
WHERE deleted_at IS NULL
  AND year IN (
    SELECT year FROM goals WHERE deleted_at IS NULL
    GROUP BY year HAVING COUNT(*) > 1
  );
--> statement-breakpoint
-- STEP 2. Keep ONE live goal per year and soft-delete the rest.
--
-- The survivor is the most recently updated row, because that is the last thing the reader
-- actually asked for. `id` breaks a tie so the result is deterministic rather than
-- whatever order the table happens to scan in.
--
-- SOFT-deleted, like every other delete in this app: `deleted_at` is set, the row syncs,
-- and the purge job removes it after 30 days. A goal a reader once set is still a thing
-- they did, and a migration is the last place to start hard-deleting rows.
UPDATE goals
SET deleted_at = CAST(strftime('%s','now') AS INTEGER) * 1000,
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE deleted_at IS NULL
  AND id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY year ORDER BY updated_at DESC, id DESC
      ) AS rn
      FROM goals WHERE deleted_at IS NULL
    ) ranked WHERE ranked.rn > 1
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_goals_year_live` ON `goals` (`year`) WHERE deleted_at IS NULL;
