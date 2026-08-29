import type { DailyHealthRecord } from "@/features/health-data/client";

type OuraRow = Record<string, unknown>;

export interface OuraAggregateInput {
  start: string;
  end: string;
  activity: OuraRow[];
  readiness: OuraRow[];
  dailySleep: OuraRow[];
  sleep: OuraRow[];
  stress: OuraRow[];
  workouts: OuraRow[];
}

export function mergeOuraAggregates(
  input: OuraAggregateInput,
): DailyHealthRecord[] {
  validateDateRange(input.start, input.end);
  const activityByDay = byDay(input.activity);
  const readinessByDay = byDay(input.readiness);
  const dailySleepByDay = byDay(input.dailySleep);
  const stressByDay = byDay(input.stress);
  const workoutsByDay = rowsByDay(input.workouts);
  const sleepByDay = rowsByDay(input.sleep);
  const records: DailyHealthRecord[] = [];

  for (
    let date = input.start;
    date <= input.end;
    date = addUtcDays(date, 1)
  ) {
    const activityRow = activityByDay.get(date);
    const readinessRow = readinessByDay.get(date);
    const dailySleepRow = dailySleepByDay.get(date);
    const stressRow = stressByDay.get(date);
    const sleepRows = sleepByDay.get(date) ?? [];
    const workoutRows = workoutsByDay.get(date) ?? [];
    const preferredSleep = [...sleepRows].sort((left, right) => {
      const typePriority =
        Number(right.type === "long_sleep") -
        Number(left.type === "long_sleep");
      return (
        typePriority ||
        (metric(right.total_sleep_duration) ?? 0) -
          (metric(left.total_sleep_duration) ?? 0)
      );
    })[0];
    const activeSeconds = sumMetrics([
      activityRow?.high_activity_time,
      activityRow?.medium_activity_time,
      activityRow?.low_activity_time,
    ]);

    records.push({
      date,
      sleepScore: metric(dailySleepRow?.score),
      readinessScore: metric(readinessRow?.score),
      activityScore: metric(activityRow?.score),
      totalSleepMinutes: secondsToMinutes(
        preferredSleep?.total_sleep_duration,
      ),
      timeInBedMinutes: secondsToMinutes(preferredSleep?.time_in_bed),
      sleepEfficiency: metric(preferredSleep?.efficiency),
      deepSleepMinutes: secondsToMinutes(
        preferredSleep?.deep_sleep_duration,
      ),
      remSleepMinutes: secondsToMinutes(preferredSleep?.rem_sleep_duration),
      sleepLatencyMinutes: secondsToMinutes(preferredSleep?.latency),
      averageBreathingRate: metric(preferredSleep?.average_breath),
      averageHeartRate: metric(preferredSleep?.average_heart_rate),
      hrvMs: metric(preferredSleep?.average_hrv),
      restingHeartRate: metric(preferredSleep?.lowest_heart_rate),
      temperatureDeviationC: metric(readinessRow?.temperature_deviation),
      stressMinutes: secondsToMinutes(stressRow?.stress_high),
      recoveryMinutes: secondsToMinutes(stressRow?.recovery_high),
      steps: metric(activityRow?.steps),
      activeCalories: metric(activityRow?.active_calories),
      totalCalories: metric(activityRow?.total_calories),
      activeMinutes: secondsToMinutes(activeSeconds),
      sedentaryMinutes: secondsToMinutes(activityRow?.sedentary_time),
      walkingEquivalentMeters: metric(
        activityRow?.equivalent_walking_distance,
      ),
      workoutMinutes: roundOne(
        workoutRows.reduce(
          (total, row) => total + workoutDurationMinutes(row),
          0,
        ),
      ),
      workoutCount: workoutRows.length,
      workoutCalories: roundOne(
        workoutRows.reduce(
          (total, row) => total + (metric(row.calories) ?? 0),
          0,
        ),
      ),
      workoutDistanceMeters: roundOne(
        workoutRows.reduce(
          (total, row) => total + (metric(row.distance) ?? 0),
          0,
        ),
      ),
    });
  }
  return records;
}

function byDay(rows: OuraRow[]): Map<string, OuraRow> {
  const result = new Map<string, OuraRow>();
  for (const row of rows) {
    if (typeof row.day === "string") result.set(row.day, row);
  }
  return result;
}

function rowsByDay(rows: OuraRow[]): Map<string, OuraRow[]> {
  const grouped = new Map<string, OuraRow[]>();
  for (const row of rows) {
    if (typeof row.day !== "string") continue;
    grouped.set(row.day, [...(grouped.get(row.day) ?? []), row]);
  }
  return grouped;
}

function metric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function secondsToMinutes(value: unknown): number | null {
  const seconds = metric(value);
  return seconds === null ? null : roundOne(seconds / 60);
}

function sumMetrics(values: unknown[]): number | null {
  const finite = values
    .map(metric)
    .filter((value): value is number => value !== null);
  return finite.length
    ? finite.reduce((total, value) => total + value, 0)
    : null;
}

function workoutDurationMinutes(workout: OuraRow): number {
  const start =
    typeof workout.start_datetime === "string"
      ? Date.parse(workout.start_datetime)
      : Number.NaN;
  const end =
    typeof workout.end_datetime === "string"
      ? Date.parse(workout.end_datetime)
      : Number.NaN;
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? roundOne((end - start) / 60_000)
    : 0;
}

function validateDateRange(start: string, end: string): void {
  const startTime = parseDate(start);
  const endTime = parseDate(end);
  if (startTime > endTime) throw new Error("Oura aggregate range is invalid");
}

function parseDate(value: string): number {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Oura aggregate date is invalid");
  }
  return timestamp;
}

function addUtcDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}
