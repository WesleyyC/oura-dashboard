CREATE TABLE `security_rate_limits` (
	`scope` text NOT NULL,
	`actor_digest` text NOT NULL,
	`window_started_at` text NOT NULL,
	`request_count` integer NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`scope`, `actor_digest`)
);
--> statement-breakpoint
CREATE INDEX `security_rate_limits_expires_idx` ON `security_rate_limits` (`expires_at`);
--> statement-breakpoint
DELETE FROM `health_accounts`
WHERE `owner_id` = '__legacy_unclaimed__';
--> statement-breakpoint
CREATE TRIGGER `health_profiles_owner_limit`
BEFORE INSERT ON `health_profiles`
WHEN (
	SELECT COUNT(*)
	FROM `health_profiles`
	WHERE `owner_id` = NEW.`owner_id`
) >= 8
BEGIN
	SELECT RAISE(ABORT, 'health_profile_limit_reached');
END;
