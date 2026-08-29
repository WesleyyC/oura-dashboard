import type { ProfileSlug } from "@/features/profile-management/client";

import type { DailyHealthRecord, HealthSnapshot } from "./contracts";

const RECORD_FIELDS = [
  "date",
  "sleepScore",
  "readinessScore",
  "activityScore",
  "totalSleepMinutes",
  "timeInBedMinutes",
  "sleepEfficiency",
  "deepSleepMinutes",
  "remSleepMinutes",
  "sleepLatencyMinutes",
  "averageBreathingRate",
  "averageHeartRate",
  "hrvMs",
  "restingHeartRate",
  "temperatureDeviationC",
  "stressMinutes",
  "recoveryMinutes",
  "steps",
  "activeCalories",
  "totalCalories",
  "activeMinutes",
  "sedentaryMinutes",
  "walkingEquivalentMeters",
  "workoutMinutes",
  "workoutCount",
  "workoutCalories",
  "workoutDistanceMeters",
] as const;

const PERCENT_FIELDS = new Set(["sleepScore", "readinessScore", "activityScore", "sleepEfficiency"]);
const INTEGER_FIELDS = new Set(["steps", "activeCalories", "totalCalories", "workoutCount"]);
const SIGNED_FIELDS = new Set(["temperatureDeviationC"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 190;
const DAY_MS = 86_400_000;
const PROFILE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,30}[a-z0-9])?$/;

function parseDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new Error(`${label} must be a YYYY-MM-DD date`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid date`);
  }
  return value;
}

export function parseRangeQuery(params: URLSearchParams): { start: string; end: string } {
  const start = parseDate(params.get("start"), "start");
  const end = parseDate(params.get("end"), "end");
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  const span = Math.round((endMs - startMs) / DAY_MS);
  if (span < 0) throw new Error("start must be on or before end");
  if (span > MAX_RANGE_DAYS) throw new Error(`date range must not exceed ${MAX_RANGE_DAYS} days`);
  return { start, end };
}

export function parseHealthProfile(
  value: unknown,
  fallback?: string,
): ProfileSlug {
  const candidate =
    (value === null || value === undefined || value === "") && fallback
      ? fallback
      : value;
  if (
    typeof candidate !== "string" ||
    !PROFILE_SLUG_PATTERN.test(candidate)
  ) {
    throw new Error("profile must be a normalized profile slug");
  }
  return candidate as ProfileSlug;
}

export function parseHealthQuery(
  params: URLSearchParams,
): { profile: ProfileSlug; start: string; end: string } {
  const profile = parseHealthProfile(params.get("profile"), "member-one");
  return { profile, ...parseRangeQuery(params) };
}

function parseMetric(field: string, value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number or null`);
  }
  if (!SIGNED_FIELDS.has(field) && value < 0) throw new Error(`${field} must not be negative`);
  if (PERCENT_FIELDS.has(field) && value > 100) throw new Error(`${field} must not exceed 100`);
  if (INTEGER_FIELDS.has(field) && !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  return value;
}

function parseRecord(input: unknown, index: number): DailyHealthRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`records[${index}] must be an object`);
  }
  const record = input as Record<string, unknown>;
  const allowedFields = new Set<string>(RECORD_FIELDS);
  const unknown = Object.keys(record).find((field) => !allowedFields.has(field));
  if (unknown) throw new Error(`Unknown field in records[${index}]: ${unknown}`);
  const missing = RECORD_FIELDS.find((field) => !(field in record));
  if (missing) throw new Error(`Missing field in records[${index}]: ${missing}`);

  return Object.fromEntries(
    RECORD_FIELDS.map((field) => [
      field,
      field === "date"
        ? parseDate(record[field], `records[${index}].date`)
        : parseMetric(field, record[field]),
    ]),
  ) as unknown as DailyHealthRecord;
}

export function parseSyncPayload(input: unknown): HealthSnapshot {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Payload must be an object");
  }
  const payload = input as Record<string, unknown>;
  const unknown = Object.keys(payload).find((field) => field !== "profile" && field !== "records");
  if (unknown) throw new Error(`Unknown payload field: ${unknown}`);
  const profile = parseHealthProfile(payload.profile);
  if (!Array.isArray(payload.records) || payload.records.length === 0) {
    throw new Error("records must be a non-empty array");
  }
  if (payload.records.length > 200) throw new Error("records must contain at most 200 rows");
  const records = payload.records.map(parseRecord);
  if (new Set(records.map(({ date }) => date)).size !== records.length) {
    throw new Error("records must contain unique dates");
  }
  return { profile, records };
}
