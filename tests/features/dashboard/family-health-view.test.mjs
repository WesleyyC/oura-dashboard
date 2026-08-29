import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { FamilyHealthView } from "../../../features/dashboard/components/FamilyHealthView.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function profile(id, displayName, colorKey, sortOrder = 0) {
  return {
    id,
    slug: id,
    displayName,
    colorKey,
    sortOrder,
    status: "connected",
    updatedAt: "2026-08-01T12:00:00.000Z",
    lastSucceededAt: "2026-08-01T12:00:00.000Z",
    coverageStartDate: "2026-07-31",
    safeErrorCode: null,
  };
}

function record(
  date,
  readinessScore,
  sleepScore,
  activityScore,
  totalSleepMinutes,
) {
  return {
    date,
    readinessScore,
    sleepScore,
    activityScore,
    totalSleepMinutes,
  };
}

function familyProfile(profileValue, records, loading = false) {
  return {
    profile: profileValue,
    records,
    loading,
    error: null,
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

function scorePanel(root, heading) {
  return root
    .findAllByProps({ className: "family-score-panel" })
    .find((panel) => text(panel.findByType("h3")) === heading);
}

function readout(panel) {
  const output = panel.findByProps({ "data-chart-date-readout": "true" });
  return {
    date: text(output.findByProps({ className: "chart-date-readout-date" })),
    values: output
      .findAllByProps({ className: "chart-date-readout-item" })
      .map(text),
  };
}

function pointerAt(clientX) {
  return {
    clientX,
    currentTarget: {
      focus() {},
      getBoundingClientRect: () => ({ left: 0, width: 600 }),
    },
  };
}

test("family score charts select earlier dates and expose every profile value", (t) => {
  const profiles = [
    familyProfile(
      profile("member-one", "Alex", "ocean"),
      [
        record("2026-07-31", 80, 75, 70, 440),
        record("2026-08-01", 90, 85, 82, 460),
      ],
    ),
    familyProfile(
      profile("member-two", "Blair", "berry", 1),
      [
        record("2026-07-31", null, 78, 74, null),
        record("2026-08-01", 88, 84, 80, 430),
      ],
    ),
  ];
  const renderer = create(React.createElement(FamilyHealthView, {
    range: "7d",
    today: "2026-08-01",
    profiles,
    onRetry() {},
  }));
  t.after(() => act(() => renderer.unmount()));

  const panels = renderer.root.findAllByProps({ className: "family-score-panel" });
  assert.equal(panels.length, 3);
  assert.equal(panels.every((panel) => panel.findAllByProps({ role: "slider" }).length === 1), true);

  const readiness = scorePanel(renderer.root, "Readiness");
  const slider = readiness.findByProps({ role: "slider" });
  assert.equal(
    slider.props["aria-valuetext"],
    "Aug 1, Alex Readiness 90, Blair Readiness 88",
  );
  assert.deepEqual(readout(readiness), {
    date: "Aug 1",
    values: ["Alex90", "Blair88"],
  });

  act(() => slider.props.onPointerMove(pointerAt(0)));
  assert.deepEqual(readout(readiness), {
    date: "Jul 31",
    values: ["Alex80", "Blair—"],
  });
  assert.equal(
    readiness.findAllByProps({ className: "chart-selection-marker" }).length,
    1,
  );
  assert.equal(
    readiness.findByProps({ className: "chart-selection-crosshair" }).props.style.left,
    `${(5 / 6) * 100}%`,
  );
});

test("family date selection synchronizes every visible plot", (t) => {
  const profiles = [
    familyProfile(
      profile("member-one", "Alex", "ocean"),
      [
        record("2026-07-31", 80, 75, 70, 440),
        record("2026-08-01", 90, 85, 82, 460),
      ],
    ),
    familyProfile(
      profile("member-two", "Blair", "berry", 1),
      [
        record("2026-07-31", 78, 77, 74, 420),
        record("2026-08-01", 88, 84, 80, 430),
      ],
    ),
  ];
  const renderer = create(React.createElement(FamilyHealthView, {
    range: "7d",
    today: "2026-08-01",
    profiles,
    onRetry() {},
  }));
  t.after(() => act(() => renderer.unmount()));

  const sliders = () => renderer.root.findAllByProps({ role: "slider" });
  const selectedDates = () => sliders().map(
    (slider) => slider.props["aria-valuetext"].split(",")[0],
  );
  assert.equal(sliders().length, 4);
  assert.deepEqual(selectedDates(), ["Aug 1", "Aug 1", "Aug 1", "Aug 1"]);

  act(() => sliders()[0].props.onPointerMove(pointerAt(0)));
  assert.deepEqual(selectedDates(), ["Jul 31", "Jul 31", "Jul 31", "Jul 31"]);

  act(() => sliders()[3].props.onPointerMove(pointerAt(600)));
  assert.deepEqual(selectedDates(), ["Aug 1", "Aug 1", "Aug 1", "Aug 1"]);
});

test("family date selection resets when the range changes", (t) => {
  const profiles = [
    familyProfile(
      profile("member-one", "Alex", "ocean"),
      [
        record("2026-07-31", 80, 75, 70, 440),
        record("2026-08-01", 90, 85, 82, 460),
      ],
    ),
    familyProfile(
      profile("member-two", "Blair", "berry", 1),
      [
        record("2026-07-31", 78, 77, 74, 420),
        record("2026-08-01", 88, 84, 80, 430),
      ],
    ),
  ];
  const familyProps = (range) => ({
    range,
    today: "2026-08-01",
    profiles,
    onRetry() {},
  });
  const renderer = create(React.createElement(
    FamilyHealthView,
    familyProps("7d"),
  ));
  t.after(() => act(() => renderer.unmount()));

  const selectedDates = () => renderer.root
    .findAllByProps({ role: "slider" })
    .map((slider) => slider.props["aria-valuetext"].split(",")[0]);
  act(() => {
    renderer.root.findAllByProps({ role: "slider" })[0]
      .props.onPointerMove(pointerAt(0));
  });
  assert.deepEqual(selectedDates(), ["Jul 31", "Jul 31", "Jul 31", "Jul 31"]);

  act(() => {
    renderer.update(React.createElement(
      FamilyHealthView,
      familyProps("14d"),
    ));
  });
  assert.deepEqual(selectedDates(), ["Aug 1", "Aug 1", "Aug 1", "Aug 1"]);
});

test("family score selection stays enabled while another profile is loading", (t) => {
  const profiles = [
    familyProfile(
      profile("member-one", "Alex", "ocean"),
      [record("2026-08-01", 90, 85, 82, 460)],
    ),
    familyProfile(
      profile("member-two", "Blair", "berry", 1),
      [],
      true,
    ),
  ];
  const renderer = create(React.createElement(FamilyHealthView, {
    range: "7d",
    today: "2026-08-01",
    profiles,
    onRetry() {},
  }));
  t.after(() => act(() => renderer.unmount()));

  const readiness = scorePanel(renderer.root, "Readiness");
  const slider = readiness.findByProps({ role: "slider" });
  assert.equal(slider.props.tabIndex, 0);
  assert.equal(slider.props["aria-disabled"], false);
  assert.equal(
    slider.props["aria-valuetext"],
    "Aug 1, Alex Readiness 90, Blair Readiness loading",
  );
  assert.deepEqual(readout(readiness), {
    date: "Aug 1",
    values: ["Alex90", "Blair…"],
  });

  const metricExplorer = renderer.root.findByProps({
    className: "metric-explorer",
  });
  const metricSlider = metricExplorer.findByProps({ role: "slider" });
  assert.equal(metricSlider.props.tabIndex, 0);
  assert.equal(metricSlider.props["aria-disabled"], false);
  assert.equal(
    metricSlider.props["aria-valuetext"],
    "Aug 1, Alex 7h 40m, Blair loading",
  );
  assert.deepEqual(readout(metricExplorer), {
    date: "Aug 1",
    values: ["Alex7h 40m", "Blair…"],
  });
});

test("family charts ignore cached values while every profile is loading", (t) => {
  const profiles = [
    familyProfile(
      profile("member-one", "Alex", "ocean"),
      [record("2026-08-01", 90, 85, 82, 460)],
      true,
    ),
    familyProfile(
      profile("member-two", "Blair", "berry", 1),
      [record("2026-08-01", 88, 84, 80, 430)],
      true,
    ),
  ];
  const renderer = create(React.createElement(FamilyHealthView, {
    range: "7d",
    today: "2026-08-01",
    profiles,
    onRetry() {},
  }));
  t.after(() => act(() => renderer.unmount()));

  const sliders = renderer.root.findAllByProps({ role: "slider" });
  assert.equal(sliders.length, 4);
  for (const slider of sliders) {
    assert.equal(slider.props.tabIndex, -1);
    assert.equal(slider.props["aria-disabled"], true);
  }
});
