import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { FamilyHealthView } from "../../../features/dashboard/components/FamilyHealthView.tsx";
import { IndividualHealthView } from "../../../features/dashboard/components/IndividualHealthView.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

const records = [
  row("2026-07-25", {
    readinessScore: 1_000,
    sleepScore: 1_000,
    sleepEfficiency: 1_000,
    hrvMs: 1_000,
  }),
  ...["2026-07-29", "2026-07-30", "2026-07-31"].map((date) => row(date, {
    readinessScore: 80,
    sleepScore: 100,
    activityScore: 90,
    totalSleepMinutes: 450,
    sleepEfficiency: 80,
    hrvMs: 50,
  })),
  row("2026-08-01", {
    readinessScore: 100,
    sleepScore: 80,
    activityScore: 90,
    totalSleepMinutes: 600,
    sleepEfficiency: 100,
    hrvMs: 20,
  }),
];

function render(element) {
  const originalError = console.error;
  console.error = (message, ...rest) => {
    if (String(message).includes("react-test-renderer is deprecated")) return;
    originalError(message, ...rest);
  };
  try {
    let renderer;
    act(() => { renderer = TestRenderer.create(element); });
    return renderer;
  } finally {
    console.error = originalError;
  }
}

function text(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node.children.map(text).join("");
}

test("individual badges classify latest selected-range outliers only", (t) => {
  const renderer = render(React.createElement(IndividualHealthView, {
    profileId: "member-one-id",
    displayName: "Alex",
    colorKey: "ocean",
    range: "7d",
    records,
    loading: false,
    error: null,
    today: "2026-08-01",
    onRetry() {},
  }));
  t.after(() => act(() => renderer.unmount()));

  const scoreStatuses = renderer.root
    .findAllByProps({ className: "metric-status score-status" })
    .map(text);
  const detailStatuses = renderer.root
    .findAllByProps({ className: "metric-status" })
    .map(text);

  assert.deepEqual(scoreStatuses, ["↑Favorable", "↓Unfavorable"]);
  assert.deepEqual(detailStatuses, ["↑Latest favorable", "↓Latest unfavorable"]);
  assert.doesNotMatch(text(renderer.root), /usual|No baseline/i);
});

test("family averages retain selected-range latest status context", (t) => {
  const profile = (id, displayName, colorKey, sortOrder) => ({
    id,
    slug: id,
    displayName,
    colorKey,
    sortOrder,
    status: "connected",
    updatedAt: "2026-08-01T12:00:00.000Z",
    lastSucceededAt: "2026-08-01T12:00:00.000Z",
    coverageStartDate: "2026-07-25",
    safeErrorCode: null,
  });
  const renderer = render(React.createElement(FamilyHealthView, {
    range: "7d",
    today: "2026-08-01",
    profiles: [
      { profile: profile("member-one", "Alex", "ocean", 0), records, loading: false, error: null },
      { profile: profile("member-two", "Blair", "berry", 1), records, loading: false, error: null },
    ],
    onRetry() {},
  }));
  t.after(() => act(() => renderer.unmount()));

  const output = text(renderer.root);
  const desktopOutput = text(
    renderer.root.findByProps({ className: "family-comparison-desktop" }),
  );
  assert.match(output, /selected-range averages/i);
  assert.match(output, /Blair − Alex/);
  assert.equal((desktopOutput.match(/Latest favorable/g) ?? []).length, 2);
  assert.equal((desktopOutput.match(/Latest unfavorable/g) ?? []).length, 2);
  assert.doesNotMatch(output, /Near usual|No baseline|personal baselines/i);
});
