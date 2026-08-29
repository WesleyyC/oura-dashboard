import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetricTrendPoints,
  dateRangePosition,
  rangeDateTicks,
  rangeWindow,
  refreshState,
  selectRange,
  summarize,
  trendWindowDays,
} from "../../../features/health-data/domain/analysis.ts";

const row = (date, overrides = {}) => ({
  date,
  sleepScore: null,
  readinessScore: null,
  activityScore: null,
  totalSleepMinutes: null,
  timeInBedMinutes: null,
  sleepEfficiency: null,
  deepSleepMinutes: null,
  remSleepMinutes: null,
  sleepLatencyMinutes: null,
  averageBreathingRate: null,
  averageHeartRate: null,
  hrvMs: null,
  restingHeartRate: null,
  temperatureDeviationC: null,
  stressMinutes: null,
  recoveryMinutes: null,
  steps: null,
  activeCalories: null,
  totalCalories: null,
  activeMinutes: null,
  sedentaryMinutes: null,
  walkingEquivalentMeters: null,
  workoutMinutes: null,
  workoutCount: null,
  workoutCalories: null,
  workoutDistanceMeters: null,
  ...overrides,
});

test("selectRange uses inclusive UTC date boundaries", () => {
  const records = [
    row("2026-01-17"),
    row("2026-01-18"),
    row("2026-04-17"),
    row("2026-04-18"),
    row("2026-07-04"),
    row("2026-07-05"),
    row("2026-07-11"),
    row("2026-07-12"),
    row("2026-07-18"),
  ];

  assert.deepEqual(
    selectRange(records, "7d", "2026-07-18").map(({ date }) => date),
    ["2026-07-12", "2026-07-18"],
  );
  assert.deepEqual(
    selectRange(records, "14d", "2026-07-18").map(({ date }) => date),
    ["2026-07-05", "2026-07-11", "2026-07-12", "2026-07-18"],
  );
  assert.deepEqual(
    selectRange(records, "3m", "2026-07-18").map(({ date }) => date),
    ["2026-04-18", "2026-07-04", "2026-07-05", "2026-07-11", "2026-07-12", "2026-07-18"],
  );
  assert.deepEqual(
    selectRange(records, "6m", "2026-07-18").map(({ date }) => date),
    ["2026-01-18", "2026-04-17", "2026-04-18", "2026-07-04", "2026-07-05", "2026-07-11", "2026-07-12", "2026-07-18"],
  );
});

test("long ranges use a seven-day moving average while two weeks stays daily", () => {
  assert.equal(trendWindowDays("7d"), 1);
  assert.equal(trendWindowDays("14d"), 1);
  assert.equal(trendWindowDays("30d"), 7);
  assert.equal(trendWindowDays("3m"), 7);
  assert.equal(trendWindowDays("6m"), 7);
});

test("metric trends average finite values without changing raw summaries", () => {
  const values = [70, null, 80, Number.NaN, 90, 100, 60];
  const records = values.map((sleepScore, index) =>
    row(`2026-07-${String(index + 1).padStart(2, "0")}`, { sleepScore }));

  const points = buildMetricTrendPoints(records, "sleepScore", 7);

  assert.equal(points.at(-1).value, 80);
  assert.equal(points[1].value, 70);
  assert.equal(summarize(records).sleepScore.average, 80);
});

test("range windows and ticks use the selected inclusive calendar span", () => {
  assert.deepEqual(rangeWindow("7d", "2026-07-30"), {
    start: "2026-07-24",
    end: "2026-07-30",
  });
  assert.deepEqual(rangeWindow("3m", "2026-07-30"), {
    start: "2026-04-30",
    end: "2026-07-30",
  });
  assert.deepEqual(rangeWindow("6m", "2026-03-31"), {
    start: "2025-09-30",
    end: "2026-03-31",
  });
  assert.deepEqual(
    rangeDateTicks("7d", "2026-07-30"),
    ["2026-07-24", "2026-07-27", "2026-07-30"],
  );
});

test("date positions preserve empty time inside the selected window", () => {
  const window = { start: "2026-01-30", end: "2026-07-30" };

  assert.equal(dateRangePosition("2026-01-30", window), 0);
  assert.ok(Math.abs(dateRangePosition("2026-04-30", window) - 0.5) < 0.01);
  assert.equal(dateRangePosition("2026-07-30", window), 1);
});

test("summarize reports null-safe averages, ranges, latest values, and counts", () => {
  const summary = summarize([
    row("2026-07-16", { sleepScore: 80, hrvMs: 45 }),
    row("2026-07-17", { sleepScore: null, hrvMs: 50 }),
    row("2026-07-18", { sleepScore: 90, hrvMs: Number.NaN }),
  ]);

  assert.deepEqual(summary.sleepScore, {
    average: 85,
    minimum: 80,
    maximum: 90,
    latest: 90,
    standardDeviation: 5,
    count: 2,
  });
  assert.deepEqual(summary.hrvMs, {
    average: 47.5,
    minimum: 45,
    maximum: 50,
    latest: 50,
    standardDeviation: 2.5,
    count: 2,
  });
});

test("selected-range summaries isolate population deviation", () => {
  const records = [
    row("2026-07-10", { sleepScore: 10 }),
    row("2026-07-16", { sleepScore: 70 }),
    row("2026-07-17", { sleepScore: null }),
    row("2026-07-18", { sleepScore: 90 }),
  ];
  const summary = summarize(selectRange(records, "7d", "2026-07-18"));

  assert.equal(summary.sleepScore.average, 80);
  assert.equal(summary.sleepScore.standardDeviation, 10);
  assert.equal(summary.sleepScore.latest, 90);
  assert.equal(summarize([]).sleepScore.standardDeviation, null);
});

test("refreshState becomes stale after 1 PM Eastern when today's refresh was missed", () => {
  const pending = refreshState("2026-07-17T16:05:00.000Z", "2026-07-18T16:59:00.000Z");
  assert.equal(pending.status, "pending");
  assert.doesNotMatch(pending.message, /12:05/);
  assert.equal(
    refreshState("2026-07-17T16:05:00.000Z", "2026-07-18T17:01:00.000Z").status,
    "stale",
  );
  assert.equal(
    refreshState("2026-07-18T16:05:00.000Z", "2026-07-18T18:00:00.000Z").status,
    "fresh",
  );
});
