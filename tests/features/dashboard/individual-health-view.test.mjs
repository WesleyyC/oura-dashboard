import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { IndividualHealthView } from "../../../features/dashboard/components/IndividualHealthView.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const records = [
  {
    date: "2026-07-31",
    readinessScore: 80,
    sleepScore: 75,
    activityScore: 70,
    totalSleepMinutes: 440,
  },
  {
    date: "2026-08-01",
    readinessScore: 90,
    sleepScore: 85,
    activityScore: 82,
    totalSleepMinutes: 460,
  },
];

function props(profileId = "member-one", displayName = "Alex", range = "7d") {
  return {
    profileId,
    displayName,
    colorKey: "ocean",
    range,
    records,
    loading: false,
    error: null,
    today: "2026-08-01",
    onRetry() {},
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

function pointerAt(clientX) {
  return {
    clientX,
    currentTarget: {
      focus() {},
      getBoundingClientRect: () => ({ left: 0, width: 600 }),
    },
  };
}

function selectedDates(root) {
  return root
    .findAllByProps({ role: "slider" })
    .map((slider) => slider.props["aria-valuetext"].split(",")[0]);
}

test("individual date selection synchronizes every visible plot", (t) => {
  const renderer = create(React.createElement(IndividualHealthView, props()));
  t.after(() => act(() => renderer.unmount()));

  const sliders = () => renderer.root.findAllByProps({ role: "slider" });
  assert.equal(sliders().length, 4);
  assert.deepEqual(selectedDates(renderer.root), ["Aug 1", "Aug 1", "Aug 1", "Aug 1"]);

  act(() => sliders()[0].props.onPointerMove(pointerAt(0)));
  assert.deepEqual(selectedDates(renderer.root), ["Jul 31", "Jul 31", "Jul 31", "Jul 31"]);

  act(() => sliders()[3].props.onPointerMove(pointerAt(600)));
  assert.deepEqual(selectedDates(renderer.root), ["Aug 1", "Aug 1", "Aug 1", "Aug 1"]);
});

test("individual date selection resets for another visible person", (t) => {
  const renderer = create(React.createElement(IndividualHealthView, props()));
  t.after(() => act(() => renderer.unmount()));

  act(() => {
    renderer.root.findAllByProps({ role: "slider" })[0]
      .props.onPointerMove(pointerAt(0));
  });
  assert.deepEqual(selectedDates(renderer.root), ["Jul 31", "Jul 31", "Jul 31", "Jul 31"]);

  act(() => {
    renderer.update(React.createElement(
      IndividualHealthView,
      props("member-two", "Blair"),
    ));
  });
  assert.deepEqual(selectedDates(renderer.root), ["Aug 1", "Aug 1", "Aug 1", "Aug 1"]);
});

test("individual date selection resets when the range changes", (t) => {
  const renderer = create(React.createElement(IndividualHealthView, props()));
  t.after(() => act(() => renderer.unmount()));

  act(() => {
    renderer.root.findAllByProps({ role: "slider" })[0]
      .props.onPointerMove(pointerAt(0));
  });
  assert.deepEqual(selectedDates(renderer.root), ["Jul 31", "Jul 31", "Jul 31", "Jul 31"]);

  act(() => {
    renderer.update(React.createElement(
      IndividualHealthView,
      props("member-one", "Alex", "14d"),
    ));
  });
  assert.deepEqual(selectedDates(renderer.root), ["Aug 1", "Aug 1", "Aug 1", "Aug 1"]);
});
