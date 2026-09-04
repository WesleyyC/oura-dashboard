import type {
  ComparisonMode,
  DailyHealthRecord,
  MetricFormat,
  MetricSummary,
  RangeKey,
  RefreshStatus,
} from "@/features/health-data/client";
import {
  dateInTimeZone,
  resolveLocalTimeZone,
} from "@/shared/time-zone";

export const RANGES: Array<{ key: RangeKey; label: string; compactLabel: string }> = [
  { key: "7d", label: "7 days", compactLabel: "7 days" },
  { key: "14d", label: "2 weeks", compactLabel: "2 weeks" },
  { key: "30d", label: "1 month", compactLabel: "1 month" },
  { key: "3m", label: "3 months", compactLabel: "3 months" },
  { key: "6m", label: "6 months", compactLabel: "6 months" },
];

export function todayInTimeZone(
  date = new Date(),
  timeZone = resolveLocalTimeZone(),
): string {
  return dateInTimeZone(date, timeZone);
}

export function formatScore(value: number | null): string {
  return value === null ? "—" : String(Math.round(value));
}

export function formatMinutes(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return hours ? `${hours}h ${minutes ? `${minutes}m` : ""}`.trim() : `${minutes}m`;
}

const chartDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDate(value: string): string {
  return chartDateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

export function formatUpdatedAt(
  value: string | null,
  timeZone = resolveLocalTimeZone(),
): string {
  if (!value) return "Not updated yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(value));
}

export interface DashboardRefreshItem {
  displayName: string;
  status: RefreshStatus["status"];
  refreshing: boolean;
  updatedAt: string | null;
}

export interface DashboardRefreshSummary {
  state: RefreshStatus["status"];
  label: string;
  detail: string;
}

export function summarizeDashboardRefresh(
  items: DashboardRefreshItem[],
  family: boolean,
  timeZone = resolveLocalTimeZone(),
): DashboardRefreshSummary {
  if (!items.length) {
    return { state: "pending", label: "Loading profiles", detail: "" };
  }

  if (items.some(({ refreshing }) => refreshing)) {
    return {
      state: "pending",
      label: family
        ? `Refreshing ${items.length} ${items.length === 1 ? "profile" : "profiles"}`
        : `Refreshing ${items[0].displayName}`,
      detail: "From Oura",
    };
  }

  const oldestUpdatedAt = items
    .map(({ updatedAt }) => updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
  const detail = family
    ? oldestUpdatedAt
      ? `Oldest sync ${formatUpdatedAt(oldestUpdatedAt, timeZone)}`
      : "Not updated yet"
    : formatUpdatedAt(items[0].updatedAt, timeZone);
  const attentionCount = items.filter(({ status }) => status === "stale").length;
  if (attentionCount) {
    return {
      state: "stale",
      label: family
        ? `${attentionCount} ${attentionCount === 1 ? "profile needs" : "profiles need"} attention`
        : `${items[0].displayName} needs attention`,
      detail,
    };
  }

  const pendingCount = items.filter(({ status }) => status === "pending").length;
  if (pendingCount) {
    return {
      state: "pending",
      label: family
        ? `${pendingCount} ${pendingCount === 1 ? "profile" : "profiles"} waiting`
        : `${items[0].displayName} is waiting`,
      detail,
    };
  }

  return {
    state: "fresh",
    label: family
      ? `${items.length} ${items.length === 1 ? "profile" : "profiles"} current`
      : `${items[0].displayName} is current`,
    detail,
  };
}

export interface TrendPoint {
  date: string;
  label: string;
  readiness: number | null;
  sleep: number | null;
  activity: number | null;
}

export interface ChartDomain {
  minimum: number;
  maximum: number;
}

function average(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

export function buildTrendPoints(records: DailyHealthRecord[], windowDays = 1): TrendPoint[] {
  const window = Math.max(1, Math.floor(windowDays));
  return records.map((record, index) => {
    const chunk = records.slice(Math.max(0, index - window + 1), index + 1);
    return {
      date: record.date,
      label: formatDate(record.date),
      readiness: average(chunk.map(({ readinessScore }) => readinessScore)),
      sleep: average(chunk.map(({ sleepScore }) => sleepScore)),
      activity: average(chunk.map(({ activityScore }) => activityScore)),
    };
  });
}

export function metricDomain(
  values: Array<number | null>,
  references: Array<number | null> = [],
): ChartDomain {
  const finite = [...values, ...references]
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finite.length) return { minimum: 0, maximum: 1 };
  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * 0.1, 1);
    return { minimum: minimum - padding, maximum: maximum + padding };
  }
  const padding = (maximum - minimum) * 0.1;
  return { minimum: minimum - padding, maximum: maximum + padding };
}

export function familyScoreDomain(values: Array<number | null>): ChartDomain {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finite.length) return { minimum: 50, maximum: 100 };

  let minimum = Math.min(100, Math.max(50, Math.floor((Math.min(...finite) - 5) / 5) * 5));
  let maximum = Math.max(50, Math.min(100, Math.ceil((Math.max(...finite) + 5) / 5) * 5));

  if (maximum - minimum < 20) {
    const missing = 20 - (maximum - minimum);
    minimum = Math.max(50, minimum - Math.ceil(missing / 5) * 5);
    maximum = Math.min(100, Math.max(maximum, minimum + 20));
    minimum = Math.max(50, Math.min(minimum, maximum - 20));
  }

  if (maximum - minimum > 25 && (maximum - minimum) % 10 !== 0) {
    if (minimum > 50) minimum -= 5;
    else if (maximum < 100) maximum += 5;
  }

  return minimum < maximum ? { minimum, maximum } : { minimum: 50, maximum: 100 };
}

export function scoreTrendDomain(values: Array<number | null>): ChartDomain {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finite.length) return { minimum: 50, maximum: 100 };

  let minimum = Math.max(0, Math.floor((Math.min(...finite) - 5) / 5) * 5);
  let maximum = Math.min(100, Math.ceil((Math.max(...finite) + 5) / 5) * 5);

  if (maximum - minimum < 20) {
    const missing = 20 - (maximum - minimum);
    minimum = Math.max(0, minimum - Math.ceil(missing / 5) * 5);
    maximum = Math.min(100, Math.max(maximum, minimum + 20));
    minimum = Math.max(0, Math.min(minimum, maximum - 20));
  }

  if (maximum - minimum > 25 && (maximum - minimum) % 10 !== 0) {
    if (minimum > 0) minimum -= 5;
    else if (maximum < 100) maximum += 5;
  }

  return minimum < maximum ? { minimum, maximum } : { minimum: 0, maximum: 100 };
}

export function familyScoreTicks(domain: ChartDomain): number[] {
  const span = domain.maximum - domain.minimum;
  const step = span > 25 ? 10 : 5;
  const ticks: number[] = [];
  for (let value = domain.minimum; value <= domain.maximum; value += step) ticks.push(value);
  if (ticks.at(-1) !== domain.maximum) ticks.push(domain.maximum);
  return ticks;
}

export function nearestScoreTrendIndex(
  positions: number[],
  target: number,
): number | null {
  if (!positions.length) return null;
  const normalized = Math.max(0, Math.min(1, target));
  let nearest = 0;
  for (let index = 1; index < positions.length; index += 1) {
    if (
      Math.abs(positions[index] - normalized) <
      Math.abs(positions[nearest] - normalized)
    ) {
      nearest = index;
    }
  }
  return nearest;
}

export function moveScoreTrendIndex(
  current: number,
  key: string,
  count: number,
): number | null {
  if (count <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowLeft" || key === "ArrowDown") return Math.max(0, current - 1);
  if (key === "ArrowRight" || key === "ArrowUp") return Math.min(count - 1, current + 1);
  return null;
}

export function formatMetricValue(value: number | null, format: MetricFormat): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (format === "duration") return formatMinutes(value);
  if (format === "percent") return `${Math.round(value)}%`;
  if (format === "milliseconds") return `${Math.round(value)} ms`;
  if (format === "bpm") return `${Math.round(value)} bpm`;
  if (format === "breathing") return `${value.toFixed(1)}/min`;
  if (format === "temperature") return `${value > 0 ? "+" : ""}${value.toFixed(1)}°`;
  if (format === "calories") return `${Math.round(value).toLocaleString()} kcal`;
  if (format === "distance") return value >= 1_000 ? `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} km` : `${Math.round(value)} m`;
  if (format === "count") return value.toFixed(value % 1 ? 1 : 0);
  return Math.round(value).toLocaleString();
}

export function formatMetricRange(minimum: number | null, maximum: number | null, format: MetricFormat): string | null {
  if (minimum === null || maximum === null) return null;
  if (minimum === maximum) return formatMetricValue(minimum, format);
  return `${formatMetricValue(minimum, format)}–${formatMetricValue(maximum, format)}`;
}

export interface MetricStatus {
  tone: "positive" | "negative";
  arrow: "↑" | "↓";
  label: "Favorable" | "Unfavorable";
  difference: number;
}

export function compareLatestToRange(
  summary: MetricSummary,
  mode: ComparisonMode,
): MetricStatus | null {
  const { latest, average: baseline, standardDeviation } = summary;
  if (
    mode === "neutral" ||
    latest === null ||
    baseline === null ||
    standardDeviation === null ||
    standardDeviation <= 0
  ) return null;

  const difference = latest - baseline;
  if (Math.abs(difference) <= standardDeviation) return null;

  let favorable: boolean;
  if (mode === "higher") favorable = difference > 0;
  else if (mode === "lower") favorable = difference < 0;
  else {
    const latestMagnitude = Math.abs(latest);
    const baselineMagnitude = Math.abs(baseline);
    if (latestMagnitude === baselineMagnitude) return null;
    favorable = latestMagnitude < baselineMagnitude;
  }

  return {
    tone: favorable ? "positive" : "negative",
    arrow: difference > 0 ? "↑" : "↓",
    label: favorable ? "Favorable" : "Unfavorable",
    difference,
  };
}

export function formatMetricDifference(value: number | null, format: MetricFormat): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return formatMetricValue(0, format);
  const absolute = formatMetricValue(Math.abs(rounded), format).replace(/^\+/, "");
  return `${rounded > 0 ? "+" : "−"}${absolute}`;
}
