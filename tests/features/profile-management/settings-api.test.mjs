import assert from "node:assert/strict";
import test from "node:test";

import { createSettingsApi } from "../../../features/profile-management/client/settings-api.ts";

function response(body, { ok = true, status = 200, jsonError = false } = {}) {
  return {
    ok,
    status,
    json: async () => {
      if (jsonError) throw new Error("invalid JSON");
      return body;
    },
  };
}

test("settings API reads account and profiles without browser caching", async () => {
  const calls = [];
  const api = createSettingsApi(async (...args) => {
    calls.push(args);
    return response(calls.length === 1
      ? { configured: { ouraClientId: true } }
      : { profiles: [] });
  });

  assert.deepEqual(await api.loadAccount(), {
    configured: { ouraClientId: true },
  });
  assert.deepEqual(await api.loadProfiles(), { profiles: [] });
  assert.deepEqual(calls, [
    ["/api/account", { cache: "no-store" }],
    ["/api/profiles", { cache: "no-store" }],
  ]);
});

test("settings API preserves connection and profile mutation contracts", async () => {
  const calls = [];
  const api = createSettingsApi(async (...args) => {
    calls.push(args);
    return response({
      authorizationUrl: "https://cloud.ouraring.com/oauth/authorize",
      profile: { id: "profile-1" },
      handoff: { connectUrl: "https://example.test", expiresAt: "soon" },
      profileId: "profile-1",
      status: "fresh",
      lastSucceededAt: null,
      safeErrorCode: null,
    });
  });

  await api.startAuthorization({ mode: "add", displayName: "Alex" });
  await api.createInvite({ mode: "reconnect", profileId: "profile-1" });
  await api.cancelInvite("profile-1");
  await api.updateProfile({ profileId: "profile-1", displayName: "Wes" });
  await api.removeProfile("profile / one");
  await api.refreshProfile("profile-1", "Asia/Shanghai");
  await api.deleteAccount();

  assert.deepEqual(calls.map(([path, init]) => [path, init.method, init.body]), [
    ["/api/oura/authorize", "POST", JSON.stringify({ mode: "add", displayName: "Alex" })],
    ["/api/oura/invites", "POST", JSON.stringify({ mode: "reconnect", profileId: "profile-1" })],
    ["/api/oura/invites", "DELETE", JSON.stringify({ profileId: "profile-1" })],
    ["/api/profiles", "PATCH", JSON.stringify({ profileId: "profile-1", displayName: "Wes" })],
    ["/api/profiles?profile_id=profile%20%2F%20one", "DELETE", undefined],
    ["/api/oura/refresh", "POST", JSON.stringify({
      profileId: "profile-1",
      timeZone: "Asia/Shanghai",
      force: true,
    })],
    ["/api/account", "DELETE", JSON.stringify({ confirmation: "DELETE" })],
  ]);
  for (const [, init] of calls) assert.equal(init.cache, "no-store");
});

test("settings API handles empty success and safe malformed errors", async () => {
  const empty = createSettingsApi(async () => response(null, { status: 204 }));
  await assert.doesNotReject(empty.cancelInvite("profile-1"));

  const malformed = createSettingsApi(async () =>
    response(null, { ok: false, status: 500, jsonError: true }));
  await assert.rejects(malformed.loadProfiles(), /Request failed/);

  const explicit = createSettingsApi(async () =>
    response({ error: "Safe failure" }, { ok: false, status: 400 }));
  await assert.rejects(explicit.loadProfiles(), /Safe failure/);
});
