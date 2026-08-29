import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("health reads and writes scope every aggregate to owner and profile", async () => {
  const [store, migrationNames] = await Promise.all([
    readFile(
      new URL(
        "../../../features/health-data/server/health-record-repository.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readdir(new URL("../../../drizzle/", import.meta.url)),
  ]);
  const migrationName = migrationNames.find((name) => /^0003_.*\.sql$/.test(name));

  assert.ok(migrationName, "expected a 0003 profile migration");
  const migration = await readFile(
    new URL(`../../../drizzle/${migrationName}`, import.meta.url),
    "utf8",
  );
  const profileTable = migration.match(/CREATE TABLE `health_daily_profile` \([\s\S]*?\n\);/i)?.[0] ?? "";

  assert.match(profileTable, /PRIMARY KEY\(`profile`, `date`\)/i);
  assert.match(
    store,
    /readHealthRange\(\s*ownerId:\s*string,\s*profileSlug:\s*ProfileSlug,\s*start:\s*string,\s*end:\s*string/s,
  );
  assert.match(store, /eq\(healthProfiles\.ownerId,\s*ownerId\)/);
  assert.match(store, /eq\(healthProfiles\.slug,\s*profileSlug\)/);
  assert.match(store, /eq\(healthDailyProfile\.ownerId,\s*ownerId\)/);
  assert.match(store, /eq\(healthDailyProfile\.profileId,\s*profile\.id\)/);
  assert.match(
    store,
    /target:\s*\[\s*healthDailyProfile\.ownerId,\s*healthDailyProfile\.profileId,\s*healthDailyProfile\.date/s,
  );
  assert.match(migration, /INSERT OR IGNORE INTO `health_daily_profile`/i);
  assert.match(migration, /SELECT\s+'member-one'/i);
  assert.match(migration, /INSERT OR IGNORE INTO `health_sync_state_profile`/i);
  assert.doesNotMatch(profileTable, /meeting|personal_minutes|work_minutes|focus_minutes/i);
});

const aggregateColumns = [
  "sleep_score",
  "readiness_score",
  "activity_score",
  "total_sleep_minutes",
  "time_in_bed_minutes",
  "sleep_efficiency",
  "deep_sleep_minutes",
  "rem_sleep_minutes",
  "sleep_latency_minutes",
  "average_breathing_rate",
  "average_heart_rate",
  "hrv_ms",
  "resting_heart_rate",
  "temperature_deviation_c",
  "stress_minutes",
  "recovery_minutes",
  "steps",
  "active_calories",
  "total_calories",
  "active_minutes",
  "sedentary_minutes",
  "walking_equivalent_meters",
  "workout_minutes",
  "workout_count",
  "workout_calories",
  "workout_distance_meters",
];

function identifierList(value) {
  return value
    .split(",")
    .map((entry) => entry.trim().replaceAll("`", ""))
    .filter(Boolean);
}

test("tenant migration copies every aggregate column before replacing legacy tables", async () => {
  const migration = await readFile(
    new URL("../../../drizzle/0004_sites_hosted_oura.sql", import.meta.url),
    "utf8",
  );
  const dailyCopy = migration.match(
    /INSERT INTO `health_daily_profile_new`\s*\(([\s\S]*?)\)\s*SELECT\s*([\s\S]*?)\s*FROM `health_daily_profile`/i,
  );

  assert.ok(dailyCopy, "expected an explicit legacy daily-data copy");
  assert.deepEqual(identifierList(dailyCopy[1]).slice(3, -1), aggregateColumns);

  const selectedColumns = [...dailyCopy[2].matchAll(/`([a-z_]+)`/g)]
    .map((match) => match[1])
    .filter((column) => column !== "profile");
  assert.deepEqual(selectedColumns.slice(1, -1), aggregateColumns);

  const createPosition = migration.indexOf("CREATE TABLE `health_daily_profile_new`");
  const copyPosition = migration.indexOf("INSERT INTO `health_daily_profile_new`");
  const dropPosition = migration.indexOf("DROP TABLE `health_daily_profile`");
  const renamePosition = migration.indexOf(
    "ALTER TABLE `health_daily_profile_new` RENAME TO `health_daily_profile`",
  );
  const indexPosition = migration.indexOf("health_daily_profile_ingested_at_idx");
  const profileOwnerIndexPosition = migration.indexOf(
    "CREATE UNIQUE INDEX `health_profiles_owner_id_uidx`",
  );

  assert.ok(createPosition >= 0 && createPosition < copyPosition);
  assert.ok(copyPosition < dropPosition);
  assert.ok(dropPosition < renamePosition);
  assert.ok(renamePosition < indexPosition);
  assert.ok(
    profileOwnerIndexPosition >= 0 && profileOwnerIndexPosition < createPosition,
    "composite parent key must be unique before transactional legacy copies",
  );
  assert.match(migration, /__legacy_unclaimed__/);
  assert.match(migration, /legacy-member-one/);
  assert.match(migration, /legacy-member-two/);
  assert.match(migration, /INSERT INTO `health_sync_state_profile_new`/);
});
