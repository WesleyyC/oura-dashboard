CREATE TABLE `health_sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`row_count` integer NOT NULL,
	`updated_at` text NOT NULL
);
