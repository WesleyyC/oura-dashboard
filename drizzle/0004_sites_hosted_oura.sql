PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `health_accounts` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`legacy_claimed_at` text
);--> statement-breakpoint
INSERT INTO `health_accounts` (`owner_id`, `created_at`, `legacy_claimed_at`)
VALUES (
	'__legacy_unclaimed__',
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	NULL
);--> statement-breakpoint
CREATE TABLE `health_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `health_accounts`(`owner_id`) ON UPDATE cascade ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `health_profiles` (
	`id`,
	`owner_id`,
	`slug`,
	`display_name`,
	`sort_order`,
	`status`,
	`created_at`,
	`updated_at`
)
VALUES
	(
		'legacy-member-one',
		'__legacy_unclaimed__',
		'member-one',
		'Alex',
		0,
		'pending',
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
	),
	(
		'legacy-member-two',
		'__legacy_unclaimed__',
		'member-two',
		'Blair',
		1,
		'pending',
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
	);--> statement-breakpoint
CREATE UNIQUE INDEX `health_profiles_owner_slug_uidx` ON `health_profiles` (`owner_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `health_profiles_owner_id_uidx` ON `health_profiles` (`owner_id`,`id`);--> statement-breakpoint
CREATE INDEX `health_profiles_owner_sort_idx` ON `health_profiles` (`owner_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `oura_credentials` (
	`owner_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`ciphertext` text NOT NULL,
	`nonce` text NOT NULL,
	`encryption_version` integer NOT NULL,
	`expires_at` text NOT NULL,
	`granted_scopes` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `profile_id`),
	FOREIGN KEY (`owner_id`,`profile_id`) REFERENCES `health_profiles`(`owner_id`,`id`) ON UPDATE cascade ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `oura_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`,`profile_id`) REFERENCES `health_profiles`(`owner_id`,`id`) ON UPDATE cascade ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `health_daily_profile_new` (
	`owner_id` text NOT NULL,
	`profile_id` text NOT NULL,
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
	PRIMARY KEY(`owner_id`, `profile_id`, `date`),
	FOREIGN KEY (`owner_id`,`profile_id`) REFERENCES `health_profiles`(`owner_id`,`id`) ON UPDATE cascade ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `health_daily_profile_new` (
	`owner_id`,
	`profile_id`,
	`date`,
	`sleep_score`,
	`readiness_score`,
	`activity_score`,
	`total_sleep_minutes`,
	`time_in_bed_minutes`,
	`sleep_efficiency`,
	`deep_sleep_minutes`,
	`rem_sleep_minutes`,
	`sleep_latency_minutes`,
	`average_breathing_rate`,
	`average_heart_rate`,
	`hrv_ms`,
	`resting_heart_rate`,
	`temperature_deviation_c`,
	`stress_minutes`,
	`recovery_minutes`,
	`steps`,
	`active_calories`,
	`total_calories`,
	`active_minutes`,
	`sedentary_minutes`,
	`walking_equivalent_meters`,
	`workout_minutes`,
	`workout_count`,
	`workout_calories`,
	`workout_distance_meters`,
	`ingested_at`
)
SELECT
	'__legacy_unclaimed__',
	CASE `profile`
		WHEN 'member-one' THEN 'legacy-member-one'
		WHEN 'member-two' THEN 'legacy-member-two'
	END,
	`date`,
	`sleep_score`,
	`readiness_score`,
	`activity_score`,
	`total_sleep_minutes`,
	`time_in_bed_minutes`,
	`sleep_efficiency`,
	`deep_sleep_minutes`,
	`rem_sleep_minutes`,
	`sleep_latency_minutes`,
	`average_breathing_rate`,
	`average_heart_rate`,
	`hrv_ms`,
	`resting_heart_rate`,
	`temperature_deviation_c`,
	`stress_minutes`,
	`recovery_minutes`,
	`steps`,
	`active_calories`,
	`total_calories`,
	`active_minutes`,
	`sedentary_minutes`,
	`walking_equivalent_meters`,
	`workout_minutes`,
	`workout_count`,
	`workout_calories`,
	`workout_distance_meters`,
	`ingested_at`
FROM `health_daily_profile`
WHERE `profile` IN ('member-one', 'member-two');--> statement-breakpoint
DROP TABLE `health_daily_profile`;--> statement-breakpoint
ALTER TABLE `health_daily_profile_new` RENAME TO `health_daily_profile`;--> statement-breakpoint
CREATE TABLE `health_sync_state_profile_new` (
	`owner_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`row_count` integer NOT NULL,
	`updated_at` text NOT NULL,
	`last_attempt_at` text,
	`last_succeeded_at` text,
	`status` text NOT NULL,
	`safe_error_code` text,
	`lock_expires_at` text,
	PRIMARY KEY(`owner_id`, `profile_id`),
	FOREIGN KEY (`owner_id`,`profile_id`) REFERENCES `health_profiles`(`owner_id`,`id`) ON UPDATE cascade ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `health_sync_state_profile_new` (
	`owner_id`,
	`profile_id`,
	`start_date`,
	`end_date`,
	`row_count`,
	`updated_at`,
	`last_attempt_at`,
	`last_succeeded_at`,
	`status`,
	`safe_error_code`,
	`lock_expires_at`
)
SELECT
	'__legacy_unclaimed__',
	CASE `profile`
		WHEN 'member-one' THEN 'legacy-member-one'
		WHEN 'member-two' THEN 'legacy-member-two'
	END,
	`start_date`,
	`end_date`,
	`row_count`,
	`updated_at`,
	NULL,
	`updated_at`,
	'succeeded',
	NULL,
	NULL
FROM `health_sync_state_profile`
WHERE `profile` IN ('member-one', 'member-two');--> statement-breakpoint
DROP TABLE `health_sync_state_profile`;--> statement-breakpoint
ALTER TABLE `health_sync_state_profile_new` RENAME TO `health_sync_state_profile`;--> statement-breakpoint
CREATE INDEX `oura_oauth_states_expires_idx` ON `oura_oauth_states` (`expires_at`);--> statement-breakpoint
CREATE INDEX `health_daily_profile_ingested_at_idx` ON `health_daily_profile` (`owner_id`,`profile_id`,`ingested_at`);--> statement-breakpoint
CREATE INDEX `health_sync_state_status_idx` ON `health_sync_state_profile` (`owner_id`,`status`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
