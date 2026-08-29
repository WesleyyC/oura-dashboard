import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { ScoreTrendPanel } from "../../../features/dashboard/components/ScoreTrendPanel.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const row = (date, label, readiness) => ({
  date,
  label,
  readiness,
  sleep: null,
  activity: null,
});

function props(points, start = "2026-07-26", end = "2026-08-01") {
  return {
    id: "score-readiness",
    label: "Readiness",
    valueKey: "readiness",
    points,
    domain: { minimum: 70, maximum: 100 },
    ticks: [70, 80, 90, 100],
    window: { start, end },
    dateTicks: [start, "Jul 29", end],
    treatment: "Daily scores",
    seriesLabel: "Alex",
    seriesColor: "var(--profile-ocean)",
    loading: false,
  };
}

function create(element) {
  const originalError = console.error;
  console.error = (message, ...rest) => {
    if (String(message).includes("react-test-renderer is deprecated")) return;
    originalError(message, ...rest);
  };
  try {
    let renderer;
    act(() => {
      renderer = TestRenderer.create(element);
    });
    return renderer;
  } finally {
    console.error = originalError;
  }
}

function readout(root) {
  const output = root.findByProps({ className: "score-trend-readout" });
  return {
    date: output.findByType("span").children.join(""),
    score: output.findByType("strong").children.join(""),
  };
}

function assertLegend(root) {
  const legend = root.findByProps({ className: "score-chart-legend" });
  assert.equal(legend.props["aria-label"], "Readiness chart legend");
  assert.match(legend.findByType("strong").children.join(""), /Alex/);
  assert.match(legend.findByType("small").children.join(""), /Daily scores/);
  assert.equal(
    legend.findByProps({ className: "chart-legend-line" })
      .props.style["--series-color"],
    "var(--profile-ocean)",
  );
}

test("score panel keeps pointer, touch, and keyboard selection in one visible accessible state", (t) => {
  const points = [
    row("2026-07-26", "Jul 26", 80),
    row("2026-07-27", "Jul 27", 82),
    row("2026-07-28", "Jul 28", 84),
    row("2026-07-29", "Jul 29", 86),
    row("2026-07-30", "Jul 30", 87),
    row("2026-07-31", "Jul 31", 88),
    row("2026-08-01", "Aug 1", 90),
  ];
  const renderer = create(React.createElement(ScoreTrendPanel, props(points)));
  t.after(() => act(() => renderer.unmount()));

  assertLegend(renderer.root);
  assert.deepEqual(readout(renderer.root), { date: "Aug 1", score: "90" });
  assert.equal(renderer.root.findByProps({ role: "slider" }).props["aria-valuetext"], "Aug 1, Readiness 90");

  act(() => {
    renderer.root.findByProps({ role: "slider" }).props.onPointerMove({
      clientX: 0,
      currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 600 }) },
    });
  });
  assert.deepEqual(readout(renderer.root), { date: "Jul 26", score: "80" });

  let focused = false;
  act(() => {
    renderer.root.findByProps({ role: "slider" }).props.onPointerDown({
      clientX: 300,
      currentTarget: {
        focus: () => { focused = true; },
        getBoundingClientRect: () => ({ left: 0, width: 600 }),
      },
    });
  });
  assert.equal(focused, true);
  assert.deepEqual(readout(renderer.root), { date: "Jul 29", score: "86" });
  assert.equal(
    renderer.root.findByProps({ className: "score-trend-crosshair" }).props.style.left,
    "50%",
  );

  const press = (key) => act(() => {
    renderer.root.findByProps({ role: "slider" }).props.onKeyDown({
      key,
      preventDefault() {},
    });
  });
  press("End");
  press("ArrowDown");
  assert.deepEqual(readout(renderer.root), { date: "Jul 31", score: "88" });
  press("ArrowUp");
  assert.deepEqual(readout(renderer.root), { date: "Aug 1", score: "90" });
  press("Home");
  assert.deepEqual(readout(renderer.root), { date: "Jul 26", score: "80" });

  const changedRange = [
    row("2026-08-02", "Aug 2", null),
    row("2026-08-03", "Aug 3", 91),
  ];
  act(() => {
    renderer.update(React.createElement(
      ScoreTrendPanel,
      props(changedRange, "2026-08-02", "2026-08-03"),
    ));
  });
  assert.deepEqual(readout(renderer.root), { date: "Aug 3", score: "91" });
  press("Home");
  assert.deepEqual(readout(renderer.root), { date: "Aug 2", score: "—" });
  assert.equal(
    renderer.root.findByProps({ role: "slider" }).props["aria-valuetext"],
    "Aug 2, no Readiness score",
  );
});

test("score panel removes an all-missing series from the tab order", (t) => {
  const points = [
    row("2026-07-31", "Jul 31", null),
    row("2026-08-01", "Aug 1", null),
  ];
  const renderer = create(React.createElement(ScoreTrendPanel, props(points, "2026-07-31")));
  t.after(() => act(() => renderer.unmount()));

  assertLegend(renderer.root);
  const slider = renderer.root.findByProps({ role: "slider" });
  assert.equal(slider.props.tabIndex, -1);
  assert.equal(slider.props["aria-disabled"], true);
  assert.equal(renderer.root.findAllByProps({ className: "score-trend-crosshair" }).length, 0);
  assert.match(renderer.root.findByProps({ className: "score-trend-message" }).children.join(""), /No readiness scores/i);

  let focused = false;
  let prevented = false;
  act(() => {
    slider.props.onPointerDown({
      clientX: 100,
      currentTarget: {
        focus: () => { focused = true; },
        getBoundingClientRect: () => ({ left: 0, width: 200 }),
      },
    });
    slider.props.onKeyDown({
      key: "Home",
      preventDefault: () => { prevented = true; },
    });
  });
  assert.equal(focused, false);
  assert.equal(prevented, false);
});
