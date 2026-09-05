import assert from "node:assert/strict";
import test from "node:test";

import { OuraApiError } from "../../../features/oura-connection/server/oura-client.ts";
import { refreshOAuthTokens } from "../../../features/oura-connection/server/oauth-service.ts";
import {
  isProfileStale,
  refreshProfile,
} from "../../../features/oura-connection/server/refresh-service.ts";

const NOW = new Date("2026-07-30T15:00:00.000Z");
const LEASE = { ownerId: "owner-a", profileId: "profile-a", id: "test-lease", expiresAt: "2026-07-30T15:05:00.000Z" };
const PROFILE = {
  id: "profile-a",
  slug: "member-one",
  displayName: "Alex",
  sortOrder: 0,
  status: "connected",
  lastSucceededAt: "2026-07-30T10:00:00.000Z",
  coverageStartDate: "2026-01-30",
  safeErrorCode: null,
};
const VALID_TOKENS = {
  accessToken: "access-a",
  refreshToken: "refresh-a",
  expiresAt: "2026-07-30T18:00:00.000Z",
  grantedScopes: ["daily", "workout"],
};
const ROTATED_TOKENS = {
  accessToken: "access-b",
  refreshToken: "refresh-b",
  expiresAt: "2026-07-30T19:00:00.000Z",
  grantedScopes: ["daily", "workout"],
};

function dependencies(overrides = {}) {
  return {
    now: () => NOW,
    loadProfile: async () => PROFILE,
    acquireLease: async () => LEASE,
    loadTokens: async () => VALID_TOKENS,
    rotateTokens: async () => ROTATED_TOKENS,
    saveTokens: async () => {},
    collect: async () => [{ date: "2026-07-30" }],
    writeRecords: async () => {},
    markSuccess: async () => {},
    markFailure: async () => {},
    markReauthorizationRequired: async () => {},
    ...overrides,
  };
}

test("explicit history repair refetches six months even when recent data is fresh", async () => {
  let requested;
  const result = await refreshProfile("owner-a", "profile-a", dependencies({
    repairHistory: true,
    loadProfile: async () => ({ ...PROFILE, lastSucceededAt: NOW.toISOString() }),
    collect: async (_tokens, _profile, range) => { requested = range; return []; },
  }));
  assert.equal(result.status, "refreshed");
  assert.deepEqual(requested, { start: "2026-01-30", end: "2026-07-30" });
});

test("three hours is the stale boundary", () => {
  assert.equal(
    isProfileStale("2026-07-30T12:00:01.000Z", NOW),
    false,
  );
  assert.equal(
    isProfileStale("2026-07-30T12:00:00.000Z", NOW),
    true,
  );
  assert.equal(isProfileStale(null, NOW), true);
  assert.equal(isProfileStale("not-a-date", NOW), true);
  assert.equal(isProfileStale("2026-08-01T00:00:00.000Z", NOW), true);
});

for (const [label, lastSucceededAt, expectedStart] of [
  ["three-week absence", "2026-09-04T15:00:00.000Z", "2026-09-04"],
  ["absence exceeding retention", "2025-01-01T15:00:00.000Z", "2026-03-25"],
  ["unknown completion", null, "2026-03-25"],
  ["invalid completion", "invalid", "2026-03-25"],
  ["future completion", "2026-10-01T15:00:00.000Z", "2026-03-25"],
  ["recent completion", "2026-09-24T15:00:00.000Z", "2026-09-18"],
]) {
  for (const force of [false, true]) {
    test(`refresh covers ${label}, force=${force}`, async () => {
      let collectedRange;
      let successRange;
      const result = await refreshProfile("owner-a", "profile-a", dependencies({
        force,
        now: () => new Date("2026-09-25T15:00:00.000Z"),
        loadProfile: async () => ({ ...PROFILE, lastSucceededAt, coverageStartDate: "2026-03-01" }),
        collect: async (_tokens, _profile, range) => {
          collectedRange = range;
          return [];
        },
        markSuccess: async ({ range }) => { successRange = range; },
      }));
      assert.equal(result.status, "refreshed");
      assert.deepEqual(collectedRange, { start: expectedStart, end: "2026-09-25" });
      assert.deepEqual(successRange, collectedRange);
    });
  }
}

test("catch-up includes the previous successful local day across a time-zone boundary", async () => {
  let collectedRange;
  await refreshProfile("owner-a", "profile-a", dependencies({
    now: () => new Date("2026-09-25T02:00:00.000Z"),
    timeZone: "America/Los_Angeles",
    loadProfile: async () => ({ ...PROFILE, lastSucceededAt: "2026-09-04T02:00:00.000Z" }),
    collect: async (_tokens, _profile, range) => { collectedRange = range; return []; },
  }));
  assert.deepEqual(collectedRange, { start: "2026-09-03", end: "2026-09-24" });
});

for (const [label, status, body, expectedCode] of [
  ["service outage", 503, "unavailable", "oura_unavailable"],
  ["outage with misleading grant body", 502, { error: "invalid_grant" }, "oura_unavailable"],
  ["rate limit", 429, "slow down", "rate_limited"],
  ["revoked grant", 400, { error: "invalid_grant" }, "authorization_required"],
  ["bad application credentials", 401, { error: "invalid_client" }, "configuration_missing"],
  ["bad request", 400, { error: "invalid_request" }, "configuration_missing"],
  ["bad scope", 400, { error: "invalid_scope" }, "configuration_missing"],
  ["unknown rejection", 400, { error: "unrecognized" }, "unexpected"],
  ["malformed success", 200, "unreadable", "unexpected"],
  ["network failure", 0, null, "oura_unavailable"],
]) {
  test(`token ${label} has the correct recovery without exposing upstream details`, async () => {
    const reauthorizations = [];
    const failures = [];
    let collected = false;
    const result = await refreshProfile("owner-a", "profile-a", dependencies({
      loadTokens: async () => ({ ...VALID_TOKENS, expiresAt: NOW.toISOString() }),
      rotateTokens: (tokens) => refreshOAuthTokens({
        clientId: "synthetic-client", clientSecret: "synthetic-secret",
        redirectUri: "https://dashboard.example.com/api/oura/callback", scopes: ["daily", "workout"],
      }, tokens.refreshToken, async () => {
        if (!status) throw new Error("private-upstream-detail");
        return new Response(typeof body === "string" ? body : JSON.stringify({ ...body, error_description: "private-upstream-detail" }), { status });
      }, NOW),
      collect: async () => { collected = true; return []; },
      markReauthorizationRequired: async (...identity) => { reauthorizations.push(identity); },
      markFailure: async (failure) => { failures.push(failure); },
    }));
    assert.equal(result.safeErrorCode, expectedCode);
    assert.equal(result.status, "failed");
    assert.equal(collected, false);
    assert.deepEqual(reauthorizations, expectedCode === "authorization_required" ? [["owner-a", "profile-a", LEASE]] : []);
    assert.equal(failures[0].safeErrorCode, expectedCode);
    assert.doesNotMatch(JSON.stringify({ result, failures }), /private-upstream-detail|synthetic-secret/);
  });
}

test("fresh profiles skip collection unless refresh is forced", async () => {
  let leases = 0;
  const fresh = dependencies({
    loadProfile: async () => ({
      ...PROFILE,
      lastSucceededAt: "2026-07-30T14:00:00.000Z",
    }),
    acquireLease: async () => {
      leases += 1;
      return LEASE;
    },
  });

  const skipped = await refreshProfile("owner-a", "profile-a", fresh);
  assert.equal(skipped.status, "fresh");
  assert.equal(leases, 0);

  const forced = await refreshProfile(
    "owner-a",
    "profile-a",
    { ...fresh, force: true },
  );
  assert.equal(forced.status, "refreshed");
  assert.equal(leases, 1);
});

test("fresh profiles with partial history backfill the full six-month window", async () => {
  let collectedRange;
  let success;
  const result = await refreshProfile(
    "owner-a",
    "profile-a",
    dependencies({
      loadProfile: async () => ({
        ...PROFILE,
        lastSucceededAt: "2026-07-30T14:00:00.000Z",
        coverageStartDate: "2026-07-23",
      }),
      collect: async (_tokens, _profile, range) => {
        collectedRange = range;
        return [{ date: "2026-07-30" }];
      },
      markSuccess: async (context) => {
        success = context;
      },
    }),
  );

  assert.equal(result.status, "refreshed");
  assert.deepEqual(collectedRange, {
    start: "2026-01-30",
    end: "2026-07-30",
  });
  assert.deepEqual(success.range, collectedRange);
});

test("covered stale profiles return to the rolling eight-day window", async () => {
  let collectedRange;
  const result = await refreshProfile(
    "owner-a",
    "profile-a",
    dependencies({
      collect: async (_tokens, _profile, range) => {
        collectedRange = range;
        return [{ date: "2026-07-30" }];
      },
    }),
  );

  assert.equal(result.status, "refreshed");
  assert.deepEqual(collectedRange, {
    start: "2026-07-23",
    end: "2026-07-30",
  });
});

test("China-local refreshes end the rolling range and initialize the lease on August 3", async () => {
  const chinaNow = new Date("2026-08-03T01:25:00.000Z");
  let collectedRange;
  let leaseArguments;
  const result = await refreshProfile(
    "owner-a",
    "profile-a",
    dependencies({
      timeZone: "Asia/Shanghai",
      now: () => chinaNow,
      loadProfile: async () => ({
        ...PROFILE,
        coverageStartDate: "2026-02-03",
      }),
      acquireLease: async (...args) => {
        leaseArguments = args;
        return LEASE;
      },
      collect: async (_tokens, _profile, range) => {
        collectedRange = range;
        return [{ date: "2026-08-03" }];
      },
    }),
  );

  assert.equal(result.status, "refreshed");
  assert.deepEqual(collectedRange, {
    start: "2026-07-27",
    end: "2026-08-03",
  });
  assert.deepEqual(leaseArguments, [
    "owner-a",
    "profile-a",
    chinaNow,
    "Asia/Shanghai",
  ]);
});

test("China-local backfills use the six-month window ending August 3", async () => {
  const chinaNow = new Date("2026-08-03T01:25:00.000Z");
  let collectedRange;
  const result = await refreshProfile(
    "owner-a",
    "profile-a",
    dependencies({
      timeZone: "Asia/Shanghai",
      now: () => chinaNow,
      loadProfile: async () => ({
        ...PROFILE,
        coverageStartDate: "2026-07-01",
      }),
      collect: async (_tokens, _profile, range) => {
        collectedRange = range;
        return [{ date: "2026-08-03" }];
      },
    }),
  );

  assert.equal(result.status, "refreshed");
  assert.deepEqual(collectedRange, {
    start: "2026-02-03",
    end: "2026-08-03",
  });
});

test("failed backfills do not mark expanded coverage as successful", async () => {
  let successes = 0;
  let failures = 0;
  let collectedRange;
  const result = await refreshProfile(
    "owner-a",
    "profile-a",
    dependencies({
      loadProfile: async () => ({
        ...PROFILE,
        coverageStartDate: "2026-07-23",
      }),
      collect: async (_tokens, _profile, range) => {
        collectedRange = range;
        throw new OuraApiError("unavailable");
      },
      markSuccess: async () => {
        successes += 1;
      },
      markFailure: async () => {
        failures += 1;
      },
    }),
  );

  assert.equal(result.status, "failed");
  assert.deepEqual(collectedRange, {
    start: "2026-01-30",
    end: "2026-07-30",
  });
  assert.equal(successes, 0);
  assert.equal(failures, 1);
});

test("duplicate leases return already-running without loading tokens", async () => {
  let tokenLoads = 0;
  const result = await refreshProfile(
    "owner-a",
    "profile-a",
    dependencies({
      acquireLease: async () => false,
      loadTokens: async () => {
        tokenLoads += 1;
        return VALID_TOKENS;
      },
    }),
  );

  assert.equal(result.status, "already_running");
  assert.equal(tokenLoads, 0);
});

test("expired rotated tokens are stored before any data request", async () => {
  const events = [];
  const expired = {
    ...VALID_TOKENS,
    expiresAt: "2026-07-30T14:59:59.000Z",
  };
  const result = await refreshProfile(
    "owner-a",
    "profile-a",
    dependencies({
      loadTokens: async () => expired,
      saveTokens: async () => events.push("saved"),
      collect: async () => {
        events.push("collected");
        return [{ date: "2026-07-30" }];
      },
      writeRecords: async () => events.push("written"),
    }),
  );

  assert.equal(result.status, "refreshed");
  assert.deepEqual(events, ["saved", "collected", "written"]);
});

test("one unauthorized collection rotates, persists, and restarts collection", async () => {
  const events = [];
  let collections = 0;
  const result = await refreshProfile(
    "owner-a",
    "profile-a",
    dependencies({
      rotateTokens: async () => {
        events.push("rotated");
        return ROTATED_TOKENS;
      },
      saveTokens: async () => events.push("saved"),
      collect: async () => {
        collections += 1;
        events.push(`collect-${collections}`);
        if (collections === 1) throw new OuraApiError("unauthorized");
        return [{ date: "2026-07-30" }];
      },
      writeRecords: async () => events.push("written"),
    }),
  );

  assert.equal(result.status, "refreshed");
  assert.deepEqual(events, [
    "collect-1",
    "rotated",
    "saved",
    "collect-2",
    "written",
  ]);
});

test("a second unauthorized response isolates reauthorization to one profile", async () => {
  const events = [];
  const result = await refreshProfile(
    "owner-a",
    "profile-a",
    dependencies({
      collect: async () => {
        throw new OuraApiError("unauthorized");
      },
      saveTokens: async () => events.push("saved"),
      markFailure: async ({ safeErrorCode }) =>
        events.push(`failed:${safeErrorCode}`),
      markReauthorizationRequired: async () => events.push("reauthorize"),
    }),
  );

  assert.deepEqual(result, {
    profileId: "profile-a",
    status: "failed",
    lastSucceededAt: PROFILE.lastSucceededAt,
    safeErrorCode: "authorization_required",
  });
  assert.deepEqual(events, [
    "saved",
    "reauthorize",
    "failed:authorization_required",
  ]);
});

test("refresh deadline aborts collection and cannot publish a late completion", async () => {
  let finish;
  let collectionSignal;
  const events = [];
  const result = await refreshProfile("owner-a", "profile-a", dependencies({
    deadlineMs: 20,
    collect: async (_tokens, _profile, _range, signal) => {
      collectionSignal = signal;
      return new Promise((resolve) => { finish = resolve; });
    },
    writeRecords: async () => events.push("write"),
    markSuccess: async () => events.push("success"),
    markFailure: async ({ lease, safeErrorCode }) => { events.push([lease.id, safeErrorCode]); },
  }));
  assert.equal(result.safeErrorCode, "refresh_interrupted");
  assert.equal(collectionSignal.aborted, true);
  finish([{ date: "2026-07-30" }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [[LEASE.id, "refresh_interrupted"]]);
});

for (const stage of ["loadProfile", "acquireLease", "markFailure", "markReauthorizationRequired"]) {
  test(`refresh remains bounded when ${stage} never settles`, async () => {
    const overrides = {
      deadlineMs: 10,
      cleanupDeadlineMs: 10,
      [stage]: () => new Promise(() => {}),
    };
    if (stage === "markFailure") overrides.collect = async () => { throw new OuraApiError("unavailable"); };
    if (stage === "markReauthorizationRequired") overrides.loadTokens = async () => null;
    const result = await refreshProfile("owner-a", "profile-a", dependencies(overrides));
    assert.equal(result.status, "failed");
    assert.ok(["refresh_interrupted", "storage_failed"].includes(result.safeErrorCode));
  });
}
