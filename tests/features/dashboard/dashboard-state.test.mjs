import assert from "node:assert/strict";
import test from "node:test";

import {
  coversHealthWindow,
  healthState,
  isStale,
  mergeHealthResults,
  profileRefreshStatus,
  resolveView,
} from "../../../features/dashboard/model/dashboard-state.ts";

function profile(overrides = {}) {
  return {
    id: "profile-1",
    slug: "member-one",
    displayName: "Alex",
    colorKey: "blue",
    sortOrder: 0,
    status: "connected",
    updatedAt: "2026-08-01T12:00:00.000Z",
    lastSucceededAt: "2026-08-01T12:00:00.000Z",
    coverageStartDate: "2026-02-01",
    safeErrorCode: null,
    ...overrides,
  };
}

function state(overrides = {}) {
  return {
    profile: profile(),
    records: [{ date: "2026-08-01" }],
    updatedAt: "2026-08-01T12:00:00.000Z",
    loading: false,
    refreshing: false,
    error: null,
    historyError: null,
    loadedStartDate: null,
    loadedEndDate: null,
    ...overrides,
  };
}

test("resolveView keeps valid views and falls back deterministically", () => {
  const profiles = [profile(), profile({ id: "profile-2", slug: "member-two" })];
  assert.equal(resolveView("family", profiles), "family");
  assert.equal(resolveView("member-two", profiles), "member-two");
  assert.equal(resolveView("unknown", profiles), "member-one");
  assert.equal(resolveView("family", profiles.slice(0, 1)), "member-one");
  assert.equal(resolveView("", []), "");
});

test("isStale includes the three-hour boundary and invalid timestamps", () => {
  const now = new Date("2026-08-01T15:00:00.000Z");
  assert.equal(isStale("2026-08-01T12:00:00.001Z", now), false);
  assert.equal(isStale("2026-08-01T12:00:00.000Z", now), true);
  assert.equal(isStale(null, now), true);
  assert.equal(isStale("invalid", now), true);
});

test("profileRefreshStatus reflects errors, pending loads, and freshness", () => {
  const now = new Date("2026-08-01T12:30:00.000Z");
  assert.equal(profileRefreshStatus(state(), now), "fresh");
  assert.equal(profileRefreshStatus(state({ refreshing: true }), now), "pending");
  assert.equal(profileRefreshStatus(state({ error: "cached reload failed" }), now), "stale");
  assert.equal(
    profileRefreshStatus(state({ profile: profile({ status: "reauthorization_required" }) }), now),
    "stale",
  );
});

test("mergeHealthResults preserves cached records on a failed reload", () => {
  const current = state();
  const merged = mergeHealthResults(
    [current],
    [current],
    [{ status: "rejected", reason: new Error("Profile unavailable") }],
  );
  assert.deepEqual(merged[0].records, current.records);
  assert.equal(merged[0].loading, false);
  assert.equal(merged[0].error, "Profile unavailable");
});

test("healthState applies new records and successful timestamps", () => {
  const next = healthState(state({ loading: true, error: "old" }), {
    profile: { id: "profile-1", slug: "member-one", displayName: "Alex" },
    records: [{ date: "2026-08-02" }],
    updatedAt: "2026-08-02T12:00:00.000Z",
  });
  assert.deepEqual(next.records, [
    { date: "2026-08-01" },
    { date: "2026-08-02" },
  ]);
  assert.equal(next.updatedAt, "2026-08-02T12:00:00.000Z");
  assert.equal(next.profile.lastSucceededAt, "2026-08-02T12:00:00.000Z");
  assert.equal(next.loading, false);
  assert.equal(next.error, null);
});

test("healthState merges records by date and widens explicit client coverage", () => {
  const next = healthState(
    state({
      records: [
        { date: "2026-07-31", sleepScore: 70 },
        { date: "2026-08-01", sleepScore: 71 },
      ],
      loadedStartDate: "2026-07-31",
      loadedEndDate: "2026-08-01",
    }),
    {
      profile: { id: "profile-1", slug: "member-one", displayName: "Alex" },
      records: [
        { date: "2026-07-30", sleepScore: 80 },
        { date: "2026-08-01", sleepScore: 81 },
      ],
      updatedAt: "2026-08-02T12:00:00.000Z",
    },
    { start: "2026-07-26", end: "2026-08-01" },
  );

  assert.deepEqual(next.records, [
    { date: "2026-07-30", sleepScore: 80 },
    { date: "2026-07-31", sleepScore: 70 },
    { date: "2026-08-01", sleepScore: 81 },
  ]);
  assert.equal(next.loadedStartDate, "2026-07-26");
  assert.equal(next.loadedEndDate, "2026-08-01");
});

test("client coverage is explicit even when the requested window has missing days", () => {
  const loaded = state({
    records: [],
    loadedStartDate: "2026-07-26",
    loadedEndDate: "2026-08-01",
  });

  assert.equal(
    coversHealthWindow(
      loaded,
      { start: "2026-07-26", end: "2026-08-01" },
    ),
    true,
  );
  assert.equal(
    coversHealthWindow(
      loaded,
      { start: "2026-07-25", end: "2026-08-01" },
    ),
    false,
  );
  assert.equal(
    coversHealthWindow(
      state(),
      { start: "2026-07-26", end: "2026-08-01" },
    ),
    false,
  );
});

test("silent background failures preserve cached data and record deferred errors", () => {
  const current = state({
    records: [{ date: "2026-08-01", sleepScore: 71 }],
    loadedStartDate: "2026-07-26",
    loadedEndDate: "2026-08-01",
  });
  const merged = mergeHealthResults(
    [current],
    [current],
    [{ status: "rejected", reason: new Error("Background unavailable") }],
    { start: "2026-02-01", end: "2026-08-01" },
    "silent",
  );

  assert.deepEqual(merged[0].records, current.records);
  assert.equal(merged[0].error, null);
  assert.equal(merged[0].historyError, "Background unavailable");
});
