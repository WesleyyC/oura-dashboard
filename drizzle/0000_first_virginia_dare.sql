CREATE TABLE `health_daily` (
	`date` text PRIMARY KEY NOT NULL,
	`sleep_score` integer,
	`readiness_score` integer,
	`activity_score` integer,
	`total_sleep_minutes` real,
	`hrv_ms` real,
	`resting_heart_rate` real,
	`steps` integer,
	`active_calories` integer,
	`meeting_minutes` real,
	`meeting_count` integer,
	`personal_minutes` real,
	`work_minutes` real,
	`focus_minutes` real,
	`late_meeting_minutes` real,
	`ingested_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `health_daily_ingested_at_idx` ON `health_daily` (`ingested_at`);