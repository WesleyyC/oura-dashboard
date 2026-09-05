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
  assert.equal(calls[0][1].cache, "no-store");
  assert.ok(calls[0][1].signal instanceof AbortSignal);
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
  for (const call of calls) {
    assert.equal(call[1].cache, "no-store");
    assert.ok(call[1].signal instanceof AbortSignal);
  }
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
  const { signal, ...request } = calls[0][1];
  assert.ok(signal instanceof AbortSignal);
  assert.deepEqual(request, {
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

for (const [label, payload, ok] of [
  ["wrong profile", { profileId: "profile-other", status: "fresh", lastSucceededAt: null, safeErrorCode: null }, true],
  ["failed HTTP", { profileId: "profile-1", status: "fresh", lastSucceededAt: null, safeErrorCode: null }, false],
  ["unknown status", { profileId: "profile-1", status: "invented", lastSucceededAt: null, safeErrorCode: null }, true],
  ["unsafe diagnostic", { profileId: "profile-1", status: "failed", lastSucceededAt: null, safeErrorCode: "private-upstream-body" }, true],
]) {
  test(`refresh rejects ${label} at the browser boundary`, async () => {
    const api = createDashboardApi(async () => response(payload, ok));
    await assert.rejects(api.requestProfileRefresh("profile-1", "UTC"), /Refresh unavailable/);
  });
}

for (const stage of ["fetch", "body"]) {
  test(`health loading has a deadline during ${stage}`, async () => {
    let signal;
    const api = createDashboardApi(async (_input, init) => {
      signal = init.signal;
      if (stage === "fetch") return new Promise(() => {});
      return { ok: true, json: () => new Promise(() => {}) };
    }, { readTimeoutMs: 10 });
    await assert.rejects(api.loadHealthProfile(profileState(), { start: "2026-09-01", end: "2026-09-04" }));
    assert.equal(signal.aborted, true);
  });
}

test("structured server failures preserve their safe recovery category on HTTP errors", async () => {
  const result = { profileId: "profile-1", status: "failed", lastSucceededAt: null, safeErrorCode: "configuration_missing" };
  const api = createDashboardApi(async () => response(result, false));
  assert.deepEqual(await api.requestProfileRefresh("profile-1", "UTC"), result);
});
