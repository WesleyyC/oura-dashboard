ALTER TABLE `health_daily` ADD `time_in_bed_minutes` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `sleep_efficiency` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `deep_sleep_minutes` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `rem_sleep_minutes` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `sleep_latency_minutes` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `average_breathing_rate` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `average_heart_rate` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `temperature_deviation_c` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `stress_minutes` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `recovery_minutes` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `total_calories` integer;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `active_minutes` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `sedentary_minutes` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `walking_equivalent_meters` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `workout_minutes` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `workout_count` integer;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `workout_calories` real;--> statement-breakpoint
ALTER TABLE `health_daily` ADD `workout_distance_meters` real;