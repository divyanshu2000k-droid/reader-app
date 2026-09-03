CREATE TABLE `book_shelves` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`shelf_id` text NOT NULL,
	`added_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shelf_id`) REFERENCES `shelves`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_book_shelves_pair` ON `book_shelves` (`book_id`,`shelf_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_book_shelves_book` ON `book_shelves` (`book_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`isbn13` text,
	`isbn10` text,
	`page_count` integer,
	`total_minutes` integer,
	`cover_url` text,
	`cover_local_path` text,
	`cover_color` text,
	`publisher` text,
	`published_year` integer,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_books_title` ON `books` (`title`);--> statement-breakpoint
CREATE INDEX `idx_books_isbn` ON `books` (`isbn13`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`year` integer NOT NULL,
	`target_books` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `metadata_cache` (
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`source`, `source_id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`read_id` text,
	`type` text DEFAULT 'note' NOT NULL,
	`content` text NOT NULL,
	`page` integer,
	`image_path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`read_id`) REFERENCES `reads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notes_book` ON `notes` (`book_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `reads` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`status` text NOT NULL,
	`rating` real,
	`review` text,
	`is_private` integer DEFAULT 1 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`read_number` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_reads_book` ON `reads` (`book_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`read_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`local_day` text NOT NULL,
	`format` text NOT NULL,
	`from_position` integer,
	`to_position` integer,
	`duration_seconds` integer,
	`is_timed` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`read_id`) REFERENCES `reads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_read` ON `sessions` (`read_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_sessions_date` ON `sessions` (`occurred_at`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_sessions_day` ON `sessions` (`local_day`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `shelves` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`operation` text NOT NULL,
	`queued_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sync_queue` ON `sync_queue` (`queued_at`);