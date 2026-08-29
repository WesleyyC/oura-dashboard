import assert from "node:assert/strict";
import test from "node:test";

import * as healthUi from "../../../features/dashboard/presentation/health-ui.ts";
import {
  buildTrendPoints,
  familyScoreDomain,
  familyScoreTicks,
  metricDomain,
  summarizeDashboardRefresh,
} from "../../../features/dashboard/presentation/health-ui.ts";

const row = (date, sleepScore, readinessScore, activityScore) => ({
  date,
  sleepScore,
  readinessScore,
  activityScore,
});

test("dashboard dates use the explicit device timezone", () => {
  const instant = new Date("2026-08-03T01:25:00.000Z");

  assert.equal(
    healthUi.todayInTimeZone?.(instant, "Asia/Shanghai"),
    "2026-08-03",
  );
  assert.equal(
    healthUi.todayInTimeZone?.(instant, "America/New_York"),
    "2026-08-02",
  );
  assert.equal(
    healthUi.formatUpdatedAt?.(
      "2026-08-03T01:25:00.000Z",
      "Asia/Shanghai",
    ),
    "Aug 3, 9:25 AM GMT+8",
  );
});

test("builds exact daily score points without transformation", () => {
  assert.deepEqual(
    buildTrendPoints([
      row("2026-07-17", 84, 76, null),
      row("2026-07-18", 78, 90, 73),
    ]),
    [
      {
        date: "2026-07-17",
        label: "Jul 17",
        sleep: 84,
        readiness: 76,
        activity: null,
      },
      {
        date: "2026-07-18",
        label: "Jul 18",
        sleep: 78,
        readiness: 90,
        activity: 73,
      },
    ],
  );
});

test("long-range score trends smooth absolute scores without changing their scale", () => {
  const points = buildTrendPoints([
    row("2026-07-01", 70, 60, 80),
    row("2026-07-02", 80, 80, null),
    row("2026-07-03", 90, 100, 60),
  ], 3);

  assert.deepEqual(points.at(-1), {
    date: "2026-07-03",
    label: "Jul 3",
    sleep: 80,
    readiness: 80,
    activity: 70,
  });
});

test("score trend selection follows the nearest date for pointer, touch, and keyboard input", () => {
  const positions = [0, 0.18, 0.51, 0.76, 1];

  assert.equal(healthUi.nearestScoreTrendIndex?.(positions, 0.64), 3);
  assert.equal(healthUi.nearestScoreTrendIndex?.(positions, -1), 0);
  assert.equal(healthUi.nearestScoreTrendIndex?.(positions, 2), 4);
  assert.equal(healthUi.nearestScoreTrendIndex?.([], 0.5), null);

  assert.equal(healthUi.moveScoreTrendIndex?.(2, "ArrowLeft", positions.length), 1);
  assert.equal(healthUi.moveScoreTrendIndex?.(2, "ArrowRight", positions.length), 3);
  assert.equal(healthUi.moveScoreTrendIndex?.(2, "Home", positions.length), 0);
  assert.equal(healthUi.moveScoreTrendIndex?.(2, "End", positions.length), 4);
  assert.equal(healthUi.moveScoreTrendIndex?.(0, "ArrowLeft", positions.length), 0);
  assert.equal(healthUi.moveScoreTrendIndex?.(4, "ArrowRight", positions.length), 4);
  assert.equal(healthUi.moveScoreTrendIndex?.(2, "Escape", positions.length), null);
});

test("metric domains include references with useful padding", () => {
  assert.deepEqual(metricDomain([10, null, 20], [15]), { minimum: 9, maximum: 21 });
  assert.deepEqual(metricDomain([5], []), { minimum: 4, maximum: 6 });
  assert.deepEqual(metricDomain([], []), { minimum: 0, maximum: 1 });
});

test("family score domains pad, clamp, and preserve a readable span", () => {
  assert.deepEqual(familyScoreDomain([82, 91, null, 87]), { minimum: 75, maximum: 100 });
  assert.deepEqual(familyScoreDomain([97, 98]), { minimum: 80, maximum: 100 });
  assert.deepEqual(familyScoreDomain([50, 55]), { minimum: 50, maximum: 70 });
  assert.deepEqual(familyScoreDomain([60, 84]), { minimum: 50, maximum: 90 });
  assert.deepEqual(familyScoreDomain([]), { minimum: 50, maximum: 100 });
});

test("individual score domains keep unusually low scores visible", () => {
  assert.deepEqual(healthUi.scoreTrendDomain?.([35, 42, 55]), { minimum: 30, maximum: 60 });
  assert.deepEqual(healthUi.scoreTrendDomain?.([8, 14]), { minimum: 0, maximum: 20 });
  assert.deepEqual(healthUi.scoreTrendDomain?.([97, 98]), { minimum: 80, maximum: 100 });
  assert.deepEqual(healthUi.scoreTrendDomain?.([]), { minimum: 50, maximum: 100 });
});

test("family score ticks use clean aligned intervals", () => {
  assert.deepEqual(familyScoreTicks({ minimum: 75, maximum: 100 }), [75, 80, 85, 90, 95, 100]);
  assert.deepEqual(familyScoreTicks({ minimum: 50, maximum: 100 }), [50, 60, 70, 80, 90, 100]);
});

test("dashboard refresh summary stays one truthful line across views", () => {
  assert.deepEqual(
    summarizeDashboardRefresh([
      {
        displayName: "Alex",
        status: "fresh",
        refreshing: false,
        updatedAt: "2026-07-31T16:43:00.000Z",
      },
    ], false, "America/New_York"),
    {
      state: "fresh",
      label: "Alex is current",
      detail: "Jul 31, 12:43 PM EDT",
    },
  );

  assert.deepEqual(
    summarizeDashboardRefresh([
      {
        displayName: "Alex",
        status: "fresh",
        refreshing: false,
        updatedAt: "2026-07-31T16:43:00.000Z",
      },
      {
        displayName: "Blair",
        status: "fresh",
        refreshing: false,
        updatedAt: "2026-07-31T15:00:00.000Z",
      },
    ], true, "America/New_York"),
    {
      state: "fresh",
      label: "2 profiles current",
      detail: "Oldest sync Jul 31, 11:00 AM EDT",
    },
  );
});

test("dashboard refresh summary prioritizes active and attention states", () => {
  const current = {
    displayName: "Alex",
    status: "fresh",
    refreshing: false,
    updatedAt: "2026-07-31T16:43:00.000Z",
  };
  const attention = {
    displayName: "Blair",
    status: "stale",
    refreshing: false,
    updatedAt: "2026-07-30T15:00:00.000Z",
  };

  assert.deepEqual(
    summarizeDashboardRefresh(
      [current, attention],
      true,
      "America/New_York",
    ),
    {
      state: "stale",
      label: "1 profile needs attention",
      detail: "Oldest sync Jul 30, 11:00 AM EDT",
    },
  );
  assert.deepEqual(
    summarizeDashboardRefresh([
      { ...current, refreshing: true },
      attention,
    ], true, "America/New_York"),
    {
      state: "pending",
      label: "Refreshing 2 profiles",
      detail: "From Oura",
    },
  );
  assert.deepEqual(
    summarizeDashboardRefresh([
      current,
      { ...attention, status: "pending" },
    ], true, "America/New_York"),
    {
      state: "pending",
      label: "1 profile waiting",
      detail: "Oldest sync Jul 30, 11:00 AM EDT",
    },
  );
});
