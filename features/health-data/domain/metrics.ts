import type { NumericHealthKey } from "./contracts";

export type MetricFormat =
  | "duration"
  | "percent"
  | "milliseconds"
  | "bpm"
  | "breathing"
  | "temperature"
  | "integer"
  | "calories"
  | "distance"
  | "count";

export type ComparisonMode = "higher" | "lower" | "toward-zero" | "neutral";
export type MetricTone = "sleep" | "recovery" | "balance" | "movement";

export interface MetricDefinition {
  key: NumericHealthKey;
  label: string;
  format: MetricFormat;
  comparison: ComparisonMode;
  tone: MetricTone;
}

export interface MetricGroupDefinition {
  title: string;
  description: string;
  tone: MetricTone;
  items: MetricDefinition[];
}

function metric(
  key: NumericHealthKey,
  label: string,
  format: MetricFormat,
  comparison: ComparisonMode,
  tone: MetricTone,
): MetricDefinition {
  return { key, label, format, comparison, tone };
}

export const METRIC_GROUPS: MetricGroupDefinition[] = [
  {
    title: "Sleep",
    description: "Duration and architecture",
    tone: "sleep",
    items: [
      metric("totalSleepMinutes", "Total sleep", "duration", "neutral", "sleep"),
      metric("sleepEfficiency", "Efficiency", "percent", "higher", "sleep"),
      metric("deepSleepMinutes", "Deep sleep", "duration", "neutral", "sleep"),
      metric("remSleepMinutes", "REM sleep", "duration", "neutral", "sleep"),
      metric("sleepLatencyMinutes", "Sleep latency", "duration", "lower", "sleep"),
      metric("timeInBedMinutes", "Time in bed", "duration", "neutral", "sleep"),
    ],
  },
  {
    title: "Recovery",
    description: "Overnight body signals",
    tone: "recovery",
    items: [
      metric("hrvMs", "Average HRV", "milliseconds", "higher", "recovery"),
      metric("restingHeartRate", "Lowest heart rate", "bpm", "neutral", "recovery"),
      metric("averageHeartRate", "Average sleep heart rate", "bpm", "neutral", "recovery"),
      metric("averageBreathingRate", "Breathing rate", "breathing", "neutral", "recovery"),
      metric("temperatureDeviationC", "Temperature deviation", "temperature", "toward-zero", "recovery"),
    ],
  },
  {
    title: "Daily balance",
    description: "Strain, restoration, and stillness",
    tone: "balance",
    items: [
      metric("stressMinutes", "Stress time", "duration", "lower", "balance"),
      metric("recoveryMinutes", "Restorative time", "duration", "higher", "balance"),
      metric("activeMinutes", "Active time", "duration", "higher", "balance"),
      metric("sedentaryMinutes", "Sedentary time", "duration", "lower", "balance"),
    ],
  },
  {
    title: "Movement",
    description: "Everyday activity and workouts",
    tone: "movement",
    items: [
      metric("steps", "Steps", "integer", "higher", "movement"),
      metric("activeCalories", "Active calories", "calories", "neutral", "movement"),
      metric("totalCalories", "Total calories", "calories", "neutral", "movement"),
      metric("walkingEquivalentMeters", "Walking equivalent", "distance", "neutral", "movement"),
      metric("workoutMinutes", "Workout time", "duration", "neutral", "movement"),
      metric("workoutCount", "Workouts", "count", "neutral", "movement"),
      metric("workoutCalories", "Workout calories", "calories", "neutral", "movement"),
      metric("workoutDistanceMeters", "Workout distance", "distance", "neutral", "movement"),
    ],
  },
];

const METRICS = new Map(
  METRIC_GROUPS.flatMap((group) => group.items).map((item) => [item.key, item]),
);

export function metricDefinition(key: NumericHealthKey): MetricDefinition {
  const definition = METRICS.get(key);
  if (!definition) throw new Error(`Unknown detailed health metric: ${key}`);
  return definition;
}
