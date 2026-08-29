import type {
  DailyHealthRecord,
  HealthSummary,
  NumericHealthKey,
  RangeKey,
  RefreshStatus,
} from "./contracts";

const NUMERIC_KEYS: NumericHealthKey[] = [
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
];

const DAY_MS = 86_400_000;

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) throw new Error(`Invalid date: ${value}`);
  return date;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: string, amount: number): string {
  return formatDateOnly(new Date(parseDateOnly(date).getTime() + amount * DAY_MS));
}

function subtractCalendarMonths(date: string, months: number): string {
  const source = parseDateOnly(date);
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth() - months;
  const day = source.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatDateOnly(new Date(Date.UTC(year, month, Math.min(day, lastDay))));
}

function rangeStart(range: RangeKey, today: string): string {
  if (range === "7d") return addUtcDays(today, -6);
  if (range === "14d") return addUtcDays(today, -13);
  if (range === "30d") return addUtcDays(today, -29);
  if (range === "3m") return subtractCalendarMonths(today, 3);
  return subtractCalendarMonths(today, 6);
}

export interface DateRangeWindow {
  start: string;
  end: string;
}

export function rangeWindow(range: RangeKey, today: string): DateRangeWindow {
  parseDateOnly(today);
  return { start: rangeStart(range, today), end: today };
}

export function rangeDateTicks(range: RangeKey, today: string): [string, string, string] {
  const window = rangeWindow(range, today);
  const startTime = parseDateOnly(window.start).getTime();
  const endTime = parseDateOnly(window.end).getTime();
  const midpoint = formatDateOnly(new Date(startTime + Math.floor((endTime - startTime) / 2)));
  return [window.start, midpoint, window.end];
}

export function dateRangePosition(date: string, window: DateRangeWindow): number {
  const startTime = parseDateOnly(window.start).getTime();
  const endTime = parseDateOnly(window.end).getTime();
  if (endTime < startTime) throw new Error("Invalid date range");
  if (endTime === startTime) return 0;
  const position = (parseDateOnly(date).getTime() - startTime) / (endTime - startTime);
  return Math.max(0, Math.min(1, position));
}

export function trendWindowDays(range: RangeKey): 1 | 7 {
  return range === "7d" || range === "14d" ? 1 : 7;
}

export interface MetricTrendPoint {
  date: string;
  value: number | null;
}

export function buildMetricTrendPoints(
  records: DailyHealthRecord[],
  key: NumericHealthKey,
  windowDays = 1,
): MetricTrendPoint[] {
  const window = Math.max(1, Math.floor(windowDays));
  return records.map((record, index) => {
    const values = records
      .slice(Math.max(0, index - window + 1), index + 1)
      .map((item) => item[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return {
      date: record.date,
      value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    };
  });
}

export function selectRange(
  records: DailyHealthRecord[],
  range: RangeKey,
  today: string,
): DailyHealthRecord[] {
  const { start } = rangeWindow(range, today);
  return records
    .filter(({ date }) => date >= start && date <= today)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function finiteValues(records: DailyHealthRecord[], key: NumericHealthKey): number[] {
  return records
    .map((record) => record[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export function summarize(records: DailyHealthRecord[]): HealthSummary {
  return Object.fromEntries(
    NUMERIC_KEYS.map((key) => {
      const values = finiteValues(records, key);
      const average = values.length
        ? values.reduce((total, value) => total + value, 0) / values.length
        : null;
      const standardDeviation = average === null
        ? null
        : Math.sqrt(
            values.reduce((total, value) => total + (value - average) ** 2, 0) /
              values.length,
          );
      return [key, {
        average,
        minimum: values.length ? Math.min(...values) : null,
        maximum: values.length ? Math.max(...values) : null,
        latest: values.at(-1) ?? null,
        standardDeviation,
        count: values.length,
      }];
    }),
  ) as HealthSummary;
}

function zonedParts(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid timestamp: ${String(value)}`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

export function refreshState(
  updatedAt: string | null,
  now: string | Date = new Date(),
  timeZone = "America/New_York",
): RefreshStatus {
  const current = zonedParts(now, timeZone);
  if (updatedAt && zonedParts(updatedAt, timeZone).date === current.date) {
    return { status: "fresh", message: "Updated today" };
  }
  if (current.hour >= 13) {
    return {
      status: "stale",
      message: "Update missed — open Codex and ask “Refresh my health dashboard now.”",
    };
  }
  return { status: "pending", message: "Waiting for today’s scheduled update" };
}
