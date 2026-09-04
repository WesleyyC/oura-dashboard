import assert from "node:assert/strict";
import test from "node:test";
import { createChartScale, chartLinePath } from "../../../features/dashboard/presentation/chart-geometry.ts";

test("chart scales map high values to the top at every chart height", () => {
  for (const height of [100, 180, 220, 240]) {
    const y = createChartScale({ minimum: 50, maximum: 100 }, height);
    assert.equal(y(100), 0);
    assert.equal(y(75), height / 2);
    assert.equal(y(50), height);
  }
});

test("only explicitly clamped scales pin out-of-range family scores to the plot", () => {
  const domain = { minimum: 50, maximum: 100 };
  const family = createChartScale(domain, 220, { clamp: true });
  const metric = createChartScale(domain, 240);
  assert.equal(family(40), 220);
  assert.equal(family(110), 0);
  assert.equal(metric(40), 288);
  assert.equal(metric(110), -48);
});

test("line geometry uses actual dates and starts a new segment at missing values", () => {
  const points = [
    { date: "2026-09-01", value: 100 },
    { date: "2026-09-02", value: 75 },
    { date: "2026-09-03", value: null },
    { date: "2026-09-05", value: 50 },
  ];
  assert.equal(chartLinePath(points, point => point.value,
    createChartScale({ minimum: 50, maximum: 100 }, 180),
    { start: "2026-09-01", end: "2026-09-05" }),
  "M0.0 0.0 L250.0 90.0 M1000.0 180.0");
});

test("non-finite or absent values cannot leak NaN or Infinity into SVG paths", () => {
  const points = [100, NaN, 75, Infinity, 50, undefined, 60].map((value, index) => ({
    date: `2026-09-0${index + 1}`, value,
  }));
  assert.equal(chartLinePath(points, point => point.value,
    createChartScale({ minimum: 50, maximum: 100 }, 100),
    { start: "2026-09-01", end: "2026-09-07" }),
  "M0.0 0.0 M333.3 50.0 M666.7 100.0 M1000.0 80.0");
});

test("empty and single-day paths remain valid without inventing measurements", () => {
  const y = createChartScale({ minimum: 0, maximum: 100 }, 100);
  const window = { start: "2026-09-01", end: "2026-09-01" };
  assert.equal(chartLinePath([], point => point.value, y, window), "");
  assert.equal(chartLinePath([{ date: window.start, value: 80 }], point => point.value, y, window), "M0.0 20.0");
});
