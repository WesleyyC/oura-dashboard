CREATE TABLE `oura_connection_invites` (
	`invite_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`,`profile_id`) REFERENCES `health_profiles`(`owner_id`,`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oura_connection_invites_profile_uidx` ON `oura_connection_invites` (`owner_id`,`profile_id`);--> statement-breakpoint
CREATE INDEX `oura_connection_invites_expires_idx` ON `oura_connection_invites` (`expires_at`);--> statement-breakpoint
ALTER TABLE `oura_oauth_states` ADD `flow` text DEFAULT 'owner' NOT NULL;