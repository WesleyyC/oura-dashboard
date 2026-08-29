CREATE TABLE `health_daily_profile` (
	`profile` text NOT NULL,
	`date` text NOT NULL,
	`sleep_score` integer,
	`readiness_score` integer,
	`activity_score` integer,
	`total_sleep_minutes` real,
	`time_in_bed_minutes` real,
	`sleep_efficiency` real,
	`deep_sleep_minutes` real,
	`rem_sleep_minutes` real,
	`sleep_latency_minutes` real,
	`average_breathing_rate` real,
	`average_heart_rate` real,
	`hrv_ms` real,
	`resting_heart_rate` real,
	`temperature_deviation_c` real,
	`stress_minutes` real,
	`recovery_minutes` real,
	`steps` integer,
	`active_calories` integer,
	`total_calories` integer,
	`active_minutes` real,
	`sedentary_minutes` real,
	`walking_equivalent_meters` real,
	`workout_minutes` real,
	`workout_count` integer,
	`workout_calories` real,
	`workout_distance_meters` real,
	`ingested_at` text NOT NULL,
	PRIMARY KEY(`profile`, `date`)
);
--> statement-breakpoint
CREATE INDEX `health_daily_profile_ingested_at_idx` ON `health_daily_profile` (`profile`,`ingested_at`);--> statement-breakpoint
CREATE TABLE `health_sync_state_profile` (
	`profile` text PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`row_count` integer NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
INSERT OR IGNORE INTO `health_daily_profile` (
	`profile`, `date`, `sleep_score`, `readiness_score`, `activity_score`,
	`total_sleep_minutes`, `time_in_bed_minutes`, `sleep_efficiency`,
	`deep_sleep_minutes`, `rem_sleep_minutes`, `sleep_latency_minutes`,
	`average_breathing_rate`, `average_heart_rate`, `hrv_ms`, `resting_heart_rate`,
	`temperature_deviation_c`, `stress_minutes`, `recovery_minutes`, `steps`,
	`active_calories`, `total_calories`, `active_minutes`, `sedentary_minutes`,
	`walking_equivalent_meters`, `workout_minutes`, `workout_count`,
	`workout_calories`, `workout_distance_meters`, `ingested_at`
)
SELECT
	'member-one', `date`, `sleep_score`, `readiness_score`, `activity_score`,
	`total_sleep_minutes`, `time_in_bed_minutes`, `sleep_efficiency`,
	`deep_sleep_minutes`, `rem_sleep_minutes`, `sleep_latency_minutes`,
	`average_breathing_rate`, `average_heart_rate`, `hrv_ms`, `resting_heart_rate`,
	`temperature_deviation_c`, `stress_minutes`, `recovery_minutes`, `steps`,
	`active_calories`, `total_calories`, `active_minutes`, `sedentary_minutes`,
	`walking_equivalent_meters`, `workout_minutes`, `workout_count`,
	`workout_calories`, `workout_distance_meters`, `ingested_at`
FROM `health_daily`;--> statement-breakpoint
INSERT OR IGNORE INTO `health_sync_state_profile` (`profile`, `start_date`, `end_date`, `row_count`, `updated_at`)
SELECT 'member-one', `start_date`, `end_date`, `row_count`, `updated_at`
FROM `health_sync_state`
WHERE `id` = 1;
