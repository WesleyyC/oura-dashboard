import assert from "node:assert/strict";
import test from "node:test";

import React, { act } from "react";
import TestRenderer from "react-test-renderer";

import { DashboardContent } from "../../../features/dashboard/components/DashboardScreen.tsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function profile(id, slug, displayName, colorKey, sortOrder) {
  return {
    id,
    slug,
    displayName,
    colorKey,
    sortOrder,
    status: "connected",
    updatedAt: "2026-08-01T12:00:00.000Z",
    lastSucceededAt: "2026-08-01T12:00:00.000Z",
    coverageStartDate: "2026-07-26",
    safeErrorCode: null,
  };
}

function records(offset = 0) {
  return [
    {
      date: "2026-07-31",
      readinessScore: 80 + offset,
      sleepScore: 75 + offset,
      activityScore: 70 + offset,
      totalSleepMinutes: 440 + offset,
    },
    {
      date: "2026-08-01",
      readinessScore: 90 + offset,
      sleepScore: 85 + offset,
      activityScore: 82 + offset,
      totalSleepMinutes: 460 + offset,
    },
  ];
}

const profiles = [
  {
    profile: profile("profile-member-one", "member-one", "Alex", "ocean", 0),
    records: records(),
    updatedAt: "2026-08-01T12:00:00.000Z",
    loading: false,
    refreshing: false,
    error: null,
    historyError: null,
    loadedStartDate: "2026-07-26",
    loadedEndDate: "2026-08-01",
  },
  {
    profile: profile("profile-member-two", "member-two", "Blair", "berry", 1),
    records: records(-2),
    updatedAt: "2026-08-01T12:00:00.000Z",
    loading: false,
    refreshing: false,
    error: null,
    historyError: null,
    loadedStartDate: "2026-07-26",
    loadedEndDate: "2026-08-01",
  },
];

function controller(view) {
  return {
    view,
    range: "7d",
    profiles,
    profilesLoading: false,
    profileListError: null,
    now: new Date("2026-08-01T12:00:00.000Z"),
    today: "2026-08-01",
    timeZone: "America/New_York",
    setRange() {},
    changeView() {},
    async refreshProfiles() {},
    retryProfiles() {},
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

test("chart date selection stays inside the currently visible dashboard view", async (t) => {
  const renderer = create(React.createElement(
    DashboardContent,
    { controller: controller("member-one") },
  ));
  t.after(() => act(() => renderer.unmount()));

  act(() => {
    renderer.root.findAllByProps({ role: "slider" })[0]
      .props.onPointerMove(pointerAt(0));
  });
  assert.deepEqual(selectedDates(renderer.root), ["Jul 31", "Jul 31", "Jul 31", "Jul 31"]);

  act(() => {
    renderer.update(React.createElement(
      DashboardContent,
      { controller: controller("family") },
    ));
  });
  await act(async () => { await import("../../../features/dashboard/components/FamilyHealthView.tsx"); });
  assert.deepEqual(selectedDates(renderer.root), ["Aug 1", "Aug 1", "Aug 1", "Aug 1"]);

  act(() => {
    renderer.root.findAllByProps({ role: "slider" })[0]
      .props.onPointerMove(pointerAt(0));
  });
  assert.deepEqual(selectedDates(renderer.root), ["Jul 31", "Jul 31", "Jul 31", "Jul 31"]);

  act(() => {
    renderer.update(React.createElement(
      DashboardContent,
      { controller: controller("member-one") },
    ));
  });
  assert.deepEqual(selectedDates(renderer.root), ["Aug 1", "Aug 1", "Aug 1", "Aug 1"]);
});
