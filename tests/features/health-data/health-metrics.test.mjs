import assert from "node:assert/strict";
import test from "node:test";

import {
  METRIC_GROUPS,
  metricDefinition,
} from "../../../features/health-data/domain/metrics.ts";
import {
  compareLatestToRange,
  formatMetricDifference,
} from "../../../features/dashboard/presentation/health-ui.ts";

const metricSummary = ({ latest, average = 100, standardDeviation = 10 }) => ({
  average,
  minimum: null,
  maximum: null,
  latest,
  standardDeviation,
  count: latest === null ? 0 : 4,
});

test("metric catalog keeps shared groups and direction semantics", () => {
  assert.deepEqual(METRIC_GROUPS.map(({ title }) => title), [
    "Sleep",
    "Recovery",
    "Daily balance",
    "Movement",
  ]);
  assert.equal(metricDefinition("sleepEfficiency").comparison, "higher");
  assert.equal(metricDefinition("stressMinutes").comparison, "lower");
  assert.equal(metricDefinition("temperatureDeviationC").comparison, "toward-zero");
  assert.equal(metricDefinition("totalSleepMinutes").comparison, "neutral");
});

test("range status requires a strict one-deviation outlier", () => {
  assert.equal(compareLatestToRange(metricSummary({ latest: 110 }), "higher"), null);
  assert.equal(compareLatestToRange(metricSummary({ latest: 90 }), "higher"), null);
  assert.deepEqual(compareLatestToRange(metricSummary({ latest: 111 }), "higher"), {
    tone: "positive", arrow: "↑", label: "Favorable", difference: 11,
  });
  assert.deepEqual(compareLatestToRange(metricSummary({ latest: 89 }), "higher"), {
    tone: "negative", arrow: "↓", label: "Unfavorable", difference: -11,
  });
});

test("range status respects metric direction", () => {
  assert.equal(compareLatestToRange(metricSummary({ latest: 111 }), "lower").tone, "negative");
  assert.equal(compareLatestToRange(metricSummary({ latest: 89 }), "lower").tone, "positive");
  assert.equal(compareLatestToRange(
    metricSummary({ latest: 0.1, average: 0.5, standardDeviation: 0.2 }),
    "toward-zero",
  ).tone, "positive");
  assert.equal(compareLatestToRange(
    metricSummary({ latest: 0.9, average: 0.5, standardDeviation: 0.2 }),
    "toward-zero",
  ).tone, "negative");
  assert.equal(compareLatestToRange(
    metricSummary({ latest: -0.5, average: 0.5, standardDeviation: 0.2 }),
    "toward-zero",
  ), null);
  assert.equal(compareLatestToRange(metricSummary({ latest: 130 }), "neutral"), null);
});

test("range status suppresses unusable distributions", () => {
  assert.equal(compareLatestToRange(metricSummary({ latest: null }), "higher"), null);
  assert.equal(compareLatestToRange(
    metricSummary({ latest: 111, standardDeviation: null }),
    "higher",
  ), null);
  assert.equal(compareLatestToRange(
    metricSummary({ latest: 100, standardDeviation: 0 }),
    "higher",
  ), null);
});

test("metric differences preserve signs and units", () => {
  assert.equal(formatMetricDifference(15, "duration"), "+15m");
  assert.equal(formatMetricDifference(-2.4, "milliseconds"), "−2 ms");
  assert.equal(formatMetricDifference(0.2, "temperature"), "+0.2°");
  assert.equal(formatMetricDifference(null, "integer"), "—");
});
