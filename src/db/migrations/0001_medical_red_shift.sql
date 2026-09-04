--> HAND-EDITED AFTER GENERATION. See DECISIONS.md, 2026-09-04.
--> drizzle-kit emitted only the CREATE UNIQUE INDEX below. On a device pass against a
--> POPULATED v1 database it failed outright:
-->     UNIQUE constraint failed: reads.book_id, reads.read_number
--> Nothing in v1 prevented two live reads of one book sharing a read_number, so real
--> databases can hold that shape. A migration that fails is not a safe no-op here: the
--> app fails closed and stays on v1 FOREVER, unable to ever upgrade, with no path out.
--> The repair below runs first and renumbers the offenders, so the index can be created.
--> This file has never shipped, which is the only reason editing it is allowed.

-- STEP 1, and it must come first: enqueue the rows that are ABOUT to change, while they
-- are still identifiable. A repaired row is a changed row and syncs like any other write;
-- skipping this leaves the server holding the numbers we just corrected. Selecting them
-- afterwards is not possible, because the repair is what erases the evidence.
INSERT INTO sync_queue (table_name, row_id, operation, queued_at, attempts)
SELECT 'reads', id, 'upsert', CAST(strftime('%s','now') AS INTEGER) * 1000, 0
FROM reads
WHERE deleted_at IS NULL
  AND book_id IN (
    SELECT book_id FROM reads WHERE deleted_at IS NULL
    GROUP BY book_id, read_number HAVING COUNT(*) > 1
  );
--> statement-breakpoint
-- STEP 2. Renumber live reads of any book holding duplicates: 1, 2, 3 … in creation
-- order. Books without duplicates are not touched at all.
UPDATE reads
SET read_number = (
  SELECT rn FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY book_id ORDER BY created_at, id) AS rn
    FROM reads WHERE deleted_at IS NULL
  ) ranked WHERE ranked.id = reads.id
),
updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE deleted_at IS NULL
  AND book_id IN (
    SELECT book_id FROM reads WHERE deleted_at IS NULL
    GROUP BY book_id, read_number HAVING COUNT(*) > 1
  );
--> statement-breakpoint
DROP INDEX `idx_books_title`;--> statement-breakpoint
DROP INDEX `idx_books_isbn`;--> statement-breakpoint
CREATE INDEX `idx_books_title` ON `books` (`title`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_books_isbn` ON `books` (`isbn13`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_reads_status` ON `reads` (`status`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reads_book_number` ON `reads` (`book_id`,`read_number`) WHERE deleted_at IS NULL;
