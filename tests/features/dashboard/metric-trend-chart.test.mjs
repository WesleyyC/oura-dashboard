import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { MetricTrendChart } from "../../../features/dashboard/components/MetricTrendChart.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const metric = {
  key: "totalSleepMinutes",
  label: "Total sleep",
  format: "duration",
  tone: "sleep",
  comparison: "higher",
};

function record(date, totalSleepMinutes) {
  return { date, totalSleepMinutes };
}

function series(id, label, color, records, average) {
  return {
    id,
    label,
    records,
    average,
    identity: { type: "person", profileId: id, color },
  };
}

function props(items, today = "2026-08-01") {
  return {
    id: "metric-test",
    metric,
    range: "7d",
    today,
    series: items,
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

function text(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node.children.map(text).join("");
}

function readout(root) {
  const output = root.findByProps({ "data-chart-date-readout": "true" });
  return {
    date: text(output.findByProps({ className: "chart-date-readout-date" })),
    values: output
      .findAllByProps({ className: "chart-date-readout-item" })
      .map(text),
  };
}

function pointerAt(clientX, onFocus = () => {}) {
  return {
    clientX,
    currentTarget: {
      focus: onFocus,
      getBoundingClientRect: () => ({ left: 0, width: 600 }),
    },
  };
}

test("metric chart selects earlier dates and exposes every series value", (t) => {
  const items = [
    series(
      "member-one",
      "Alex",
      "var(--profile-ocean)",
      [record("2026-07-31", 440), record("2026-08-01", 460)],
      450,
    ),
    series(
      "member-two",
      "Blair",
      "var(--profile-berry)",
      [record("2026-07-31", null), record("2026-08-01", 430)],
      430,
    ),
  ];
  const renderer = create(React.createElement(MetricTrendChart, props(items)));
  t.after(() => act(() => renderer.unmount()));

  const slider = () => renderer.root.findByProps({ role: "slider" });
  assert.deepEqual(readout(renderer.root), {
    date: "Aug 1",
    values: ["Alex7h 40m", "Blair7h 10m"],
  });
  assert.equal(
    slider().props["aria-valuetext"],
    "Aug 1, Alex 7h 40m, Blair 7h 10m",
  );
  assert.equal(
    renderer.root.findAllByProps({ className: "chart-selection-marker" }).length,
    2,
  );

  act(() => slider().props.onPointerMove(pointerAt(0)));
  assert.deepEqual(readout(renderer.root), {
    date: "Jul 31",
    values: ["Alex7h 20m", "Blair—"],
  });
  assert.equal(
    renderer.root.findAllByProps({ className: "chart-selection-marker" }).length,
    1,
  );

  let focused = false;
  act(() => slider().props.onPointerDown(pointerAt(600, () => { focused = true; })));
  assert.equal(focused, true);
  assert.equal(readout(renderer.root).date, "Aug 1");
  assert.equal(
    renderer.root.findByProps({ className: "chart-selection-crosshair" }).props.style.left,
    "100%",
  );

  const press = (key) => act(() => slider().props.onKeyDown({
    key,
    preventDefault() {},
  }));
  press("Home");
  assert.equal(readout(renderer.root).date, "Jul 31");
  press("End");
  assert.equal(readout(renderer.root).date, "Aug 1");

  const changedItems = [
    series(
      "member-one",
      "Alex",
      "var(--profile-ocean)",
      [record("2026-08-02", 470), record("2026-08-03", 480)],
      475,
    ),
    series(
      "member-two",
      "Blair",
      "var(--profile-berry)",
      [record("2026-08-02", 440), record("2026-08-03", 450)],
      445,
    ),
  ];
  act(() => {
    renderer.update(React.createElement(
      MetricTrendChart,
      props(changedItems, "2026-08-03"),
    ));
  });
  assert.deepEqual(readout(renderer.root), {
    date: "Aug 3",
    values: ["Alex8h", "Blair7h 30m"],
  });
});

test("metric chart disables date selection when every series is missing", (t) => {
  const items = [
    series(
      "member-one",
      "Alex",
      "var(--profile-ocean)",
      [record("2026-07-31", null), record("2026-08-01", null)],
      null,
    ),
  ];
  const renderer = create(React.createElement(MetricTrendChart, props(items)));
  t.after(() => act(() => renderer.unmount()));

  const slider = renderer.root.findByProps({ role: "slider" });
  assert.equal(slider.props.tabIndex, -1);
  assert.equal(slider.props["aria-disabled"], true);
  assert.equal(renderer.root.findAllByProps({ className: "chart-selection-crosshair" }).length, 0);
  assert.deepEqual(readout(renderer.root), {
    date: "Aug 1",
    values: ["Alex—"],
  });
});

test("metric chart aligns its y-axis with the plot below the date readout", (t) => {
  const items = [
    series(
      "member-one",
      "Alex",
      "var(--profile-ocean)",
      [record("2026-08-01", 460)],
      460,
    ),
  ];
  const renderer = create(React.createElement(MetricTrendChart, props(items)));
  t.after(() => act(() => renderer.unmount()));

  const frame = renderer.root.findByProps({ className: "metric-chart-frame" });
  const body = frame.findByProps({ className: "metric-chart-body" });
  const axes = body.findAll(node => node.type === "div" && node.props.className === "metric-chart-y-axis");
  assert.equal(axes.length, 1);
  assert.deepEqual(axes[0].findAllByType("span").map(label => label.props.style.top), ["0%", "100%"]);
  assert.equal(body.findAllByProps({ className: "metric-chart-plot chart-selection-surface" }).length, 1);
  assert.equal(body.findAllByProps({ "data-chart-date-readout": "true" }).length, 0);
});
