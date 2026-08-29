import assert from "node:assert/strict";
import test from "node:test";

import { createDashboardApi } from "../../../features/dashboard/client/dashboard-api.ts";

function profileState() {
  return {
    profile: {
      id: "profile-1",
      slug: "member-one",
      displayName: "Alex",
    },
    records: [],
    updatedAt: null,
    loading: true,
    refreshing: false,
    error: null,
  };
}

function response(body, ok = true) {
  return { ok, json: async () => body };
}

test("dashboard API loads profiles without browser caching", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const api = createDashboardApi(async (...args) => {
    calls.push(args);
    return response({ profiles: [{ id: "profile-1" }] });
  });

  assert.deepEqual(await api.loadProfiles(signal), [{ id: "profile-1" }]);
  assert.equal(calls[0][0], "/api/profiles");
  assert.deepEqual(calls[0][1], { cache: "no-store", signal });
});

test("dashboard API requests each explicit inclusive profile window", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const health = {
    profile: { id: "profile-1", slug: "member-one", displayName: "Alex" },
    records: [],
    updatedAt: null,
  };
  const api = createDashboardApi(async (...args) => {
    calls.push(args);
    return response(health);
  });

  const results = await Promise.allSettled([
    api.loadHealthProfile(
      profileState(),
      { start: "2026-07-26", end: "2026-08-01" },
      signal,
    ),
    api.loadHealthProfile(
      profileState(),
      { start: "2026-02-01", end: "2026-08-01" },
      signal,
    ),
  ]);

  assert.deepEqual(
    results.map((result) => result.status),
    ["fulfilled", "fulfilled"],
  );
  assert.equal(results[0].value, health);
  assert.equal(results[1].value, health);
  assert.equal(
    calls[0][0],
    "/api/health?profile=member-one&start=2026-07-26&end=2026-08-01",
  );
  assert.equal(
    calls[1][0],
    "/api/health?profile=member-one&start=2026-02-01&end=2026-08-01",
  );
  assert.deepEqual(calls[0][1], { signal, cache: "no-store" });
  assert.deepEqual(calls[1][1], { signal, cache: "no-store" });
});

test("dashboard API posts scoped refresh requests and validates responses", async () => {
  const calls = [];
  const result = {
    profileId: "profile-1",
    status: "refreshed",
    lastSucceededAt: "2026-08-01T12:00:00.000Z",
    safeErrorCode: null,
  };
  const api = createDashboardApi(async (...args) => {
    calls.push(args);
    return response(result);
  });

  assert.equal(
    await api.requestProfileRefresh("profile-1", "Asia/Shanghai", true),
    result,
  );
  assert.equal(calls[0][0], "/api/oura/refresh");
  assert.deepEqual(calls[0][1], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileId: "profile-1",
      timeZone: "Asia/Shanghai",
      force: true,
    }),
    cache: "no-store",
  });
  assert.doesNotMatch(calls[0][1].body, /token|secret|credential/i);

  const malformed = createDashboardApi(async () => response({ status: "fresh" }));
  await assert.rejects(
    malformed.requestProfileRefresh("profile-1", "Asia/Shanghai"),
    /Refresh unavailable/,
  );
});
