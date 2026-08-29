import { and, asc, between, eq, sql } from "drizzle-orm";

import {
  getDb,
  healthDailyProfile,
  healthProfiles,
  healthSyncStateProfile,
} from "@/platform/database/server";
import {
  ensureHealthAccount,
  ProfileNotFoundError,
} from "@/features/profile-management/server";
import type {
  DailyHealthRecord,
  HealthResponse,
} from "../domain/contracts";
import type { ProfileSlug } from "@/features/profile-management/client";

const RECORD_COLUMNS = {
  date: healthDailyProfile.date,
  sleepScore: healthDailyProfile.sleepScore,
  readinessScore: healthDailyProfile.readinessScore,
  activityScore: healthDailyProfile.activityScore,
  totalSleepMinutes: healthDailyProfile.totalSleepMinutes,
  timeInBedMinutes: healthDailyProfile.timeInBedMinutes,
  sleepEfficiency: healthDailyProfile.sleepEfficiency,
  deepSleepMinutes: healthDailyProfile.deepSleepMinutes,
  remSleepMinutes: healthDailyProfile.remSleepMinutes,
  sleepLatencyMinutes: healthDailyProfile.sleepLatencyMinutes,
  averageBreathingRate: healthDailyProfile.averageBreathingRate,
  averageHeartRate: healthDailyProfile.averageHeartRate,
  hrvMs: healthDailyProfile.hrvMs,
  restingHeartRate: healthDailyProfile.restingHeartRate,
  temperatureDeviationC: healthDailyProfile.temperatureDeviationC,
  stressMinutes: healthDailyProfile.stressMinutes,
  recoveryMinutes: healthDailyProfile.recoveryMinutes,
  steps: healthDailyProfile.steps,
  activeCalories: healthDailyProfile.activeCalories,
  totalCalories: healthDailyProfile.totalCalories,
  activeMinutes: healthDailyProfile.activeMinutes,
  sedentaryMinutes: healthDailyProfile.sedentaryMinutes,
  walkingEquivalentMeters: healthDailyProfile.walkingEquivalentMeters,
  workoutMinutes: healthDailyProfile.workoutMinutes,
  workoutCount: healthDailyProfile.workoutCount,
  workoutCalories: healthDailyProfile.workoutCalories,
  workoutDistanceMeters: healthDailyProfile.workoutDistanceMeters,
};

export async function readHealthRange(
  ownerId: string,
  profileSlug: ProfileSlug,
  start: string,
  end: string,
): Promise<HealthResponse> {
  await ensureHealthAccount(ownerId);
  const db = getDb();
  const profiles = await db
    .select({
      id: healthProfiles.id,
      slug: healthProfiles.slug,
      displayName: healthProfiles.displayName,
    })
    .from(healthProfiles)
    .where(and(
      eq(healthProfiles.ownerId, ownerId),
      eq(healthProfiles.slug, profileSlug),
    ))
    .limit(1);
  const profile = profiles[0];
  if (!profile) throw new ProfileNotFoundError();

  const records = await db
    .select(RECORD_COLUMNS)
    .from(healthDailyProfile)
    .where(and(
      eq(healthDailyProfile.ownerId, ownerId),
      eq(healthDailyProfile.profileId, profile.id),
      between(healthDailyProfile.date, start, end),
    ))
    .orderBy(asc(healthDailyProfile.date));
  const completed = await db
    .select({
      updatedAt: healthSyncStateProfile.updatedAt,
      lastSucceededAt: healthSyncStateProfile.lastSucceededAt,
    })
    .from(healthSyncStateProfile)
    .where(and(
      eq(healthSyncStateProfile.ownerId, ownerId),
      eq(healthSyncStateProfile.profileId, profile.id),
    ))
    .limit(1);
  return {
    profile: {
      id: profile.id,
      slug: profile.slug as ProfileSlug,
      displayName: profile.displayName,
    },
    records: records as DailyHealthRecord[],
    updatedAt:
      completed[0]?.lastSucceededAt ??
      completed[0]?.updatedAt ??
      null,
  };
}

export async function writeHealthRecords(
  ownerId: string,
  profileId: string,
  records: DailyHealthRecord[],
  ingestedAt = new Date().toISOString(),
): Promise<number> {
  if (!ownerId || !profileId) {
    throw new Error("Health record identity is invalid");
  }
  const chunkSize = 3;
  for (let index = 0; index < records.length; index += chunkSize) {
    await writeHealthChunk(
      ownerId,
      profileId,
      records.slice(index, index + chunkSize),
      ingestedAt,
    );
  }
  return records.length;
}

async function writeHealthChunk(
  ownerId: string,
  profileId: string,
  chunk: DailyHealthRecord[],
  ingestedAt: string,
): Promise<void> {
  if (!chunk.length) return;
  const values = chunk.map((record) => ({
    ownerId,
    profileId,
    ...record,
    ingestedAt,
  }));
  await getDb()
    .insert(healthDailyProfile)
    .values(values)
    .onConflictDoUpdate({
      target: [
        healthDailyProfile.ownerId,
        healthDailyProfile.profileId,
        healthDailyProfile.date,
      ],
      set: {
        sleepScore: sql`excluded.sleep_score`,
        readinessScore: sql`excluded.readiness_score`,
        activityScore: sql`excluded.activity_score`,
        totalSleepMinutes: sql`excluded.total_sleep_minutes`,
        timeInBedMinutes: sql`excluded.time_in_bed_minutes`,
        sleepEfficiency: sql`excluded.sleep_efficiency`,
        deepSleepMinutes: sql`excluded.deep_sleep_minutes`,
        remSleepMinutes: sql`excluded.rem_sleep_minutes`,
        sleepLatencyMinutes: sql`excluded.sleep_latency_minutes`,
        averageBreathingRate: sql`excluded.average_breathing_rate`,
        averageHeartRate: sql`excluded.average_heart_rate`,
        hrvMs: sql`excluded.hrv_ms`,
        restingHeartRate: sql`excluded.resting_heart_rate`,
        temperatureDeviationC: sql`excluded.temperature_deviation_c`,
        stressMinutes: sql`excluded.stress_minutes`,
        recoveryMinutes: sql`excluded.recovery_minutes`,
        steps: sql`excluded.steps`,
        activeCalories: sql`excluded.active_calories`,
        totalCalories: sql`excluded.total_calories`,
        activeMinutes: sql`excluded.active_minutes`,
        sedentaryMinutes: sql`excluded.sedentary_minutes`,
        walkingEquivalentMeters: sql`excluded.walking_equivalent_meters`,
        workoutMinutes: sql`excluded.workout_minutes`,
        workoutCount: sql`excluded.workout_count`,
        workoutCalories: sql`excluded.workout_calories`,
        workoutDistanceMeters: sql`excluded.workout_distance_meters`,
        ingestedAt,
      },
    });
}
