import type { ProfileSlug } from "@/features/profile-management/client";

export type RangeKey = "7d" | "14d" | "30d" | "3m" | "6m";

export interface DailyHealthRecord {
  date: string;
  sleepScore: number | null;
  readinessScore: number | null;
  activityScore: number | null;
  totalSleepMinutes: number | null;
  timeInBedMinutes: number | null;
  sleepEfficiency: number | null;
  deepSleepMinutes: number | null;
  remSleepMinutes: number | null;
  sleepLatencyMinutes: number | null;
  averageBreathingRate: number | null;
  averageHeartRate: number | null;
  hrvMs: number | null;
  restingHeartRate: number | null;
  temperatureDeviationC: number | null;
  stressMinutes: number | null;
  recoveryMinutes: number | null;
  steps: number | null;
  activeCalories: number | null;
  totalCalories: number | null;
  activeMinutes: number | null;
  sedentaryMinutes: number | null;
  walkingEquivalentMeters: number | null;
  workoutMinutes: number | null;
  workoutCount: number | null;
  workoutCalories: number | null;
  workoutDistanceMeters: number | null;
}

export interface HealthSnapshot {
  profile: ProfileSlug;
  records: DailyHealthRecord[];
}

export interface HealthResponseProfile {
  id: string;
  slug: ProfileSlug;
  displayName: string;
}

export interface HealthResponse {
  profile: HealthResponseProfile;
  records: DailyHealthRecord[];
  updatedAt: string | null;
}

export type NumericHealthKey = Exclude<keyof DailyHealthRecord, "date">;

export interface MetricSummary {
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  latest: number | null;
  standardDeviation: number | null;
  count: number;
}

export type HealthSummary = Record<NumericHealthKey, MetricSummary>;

export interface RefreshStatus {
  status: "fresh" | "pending" | "stale";
  message: string;
}
