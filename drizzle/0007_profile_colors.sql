ALTER TABLE `health_profiles` ADD `color_key` text;
--> statement-breakpoint
UPDATE health_profiles
SET color_key = CASE (sort_order % 6)
	WHEN 0 THEN 'ocean'
	WHEN 1 THEN 'berry'
	WHEN 2 THEN 'meadow'
	WHEN 3 THEN 'sunset'
	WHEN 4 THEN 'iris'
	ELSE 'lagoon'
END
WHERE color_key IS NULL;
