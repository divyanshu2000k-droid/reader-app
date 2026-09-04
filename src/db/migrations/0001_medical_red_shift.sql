DROP INDEX `idx_books_title`;--> statement-breakpoint
DROP INDEX `idx_books_isbn`;--> statement-breakpoint
CREATE INDEX `idx_books_title` ON `books` (`title`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_books_isbn` ON `books` (`isbn13`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_reads_status` ON `reads` (`status`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reads_book_number` ON `reads` (`book_id`,`read_number`) WHERE deleted_at IS NULL;