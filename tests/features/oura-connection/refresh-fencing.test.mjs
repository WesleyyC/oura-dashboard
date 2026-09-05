import assert from "node:assert/strict";
import test from "node:test";
import { setRuntimeEnv } from "../../../platform/runtime/server.ts";
import { acquireRefreshLease, markRefreshFailure, markRefreshSuccess, markRefreshReauthorizationRequired } from "../../../features/oura-connection/server/refresh-state-repository.ts";
import { loadTokenSet, replaceTokenSet, saveTokenSet } from "../../../features/oura-connection/server/token-repository.ts";
import { writeHealthRecords } from "../../../features/health-data/server.ts";
import { createD1Fixture } from "../../platform/database/d1-fixture.mjs";

const TOKENS = { accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: "2099-01-01T00:00:00.000Z", grantedScopes: ["daily", "workout"] };

async function fixture(t) {
  const db = await createD1Fixture(t);
  const environment = { DB: db.binding };
  environment.OURA_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString("base64url");
  setRuntimeEnv(environment);
  for (const suffix of ["a", "b"]) {
    db.sqlite.prepare("INSERT INTO health_accounts(owner_id, created_at) VALUES (?, ?)").run(`owner-${suffix}`, new Date().toISOString());
    db.sqlite.prepare("INSERT INTO health_profiles(id, owner_id, slug, display_name, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'connected', ?, ?)")
      .run(`profile-${suffix}`, `owner-${suffix}`, `person-${suffix}`, "Synthetic person", new Date().toISOString(), new Date().toISOString());
    await saveTokenSet(`owner-${suffix}`, `profile-${suffix}`, TOKENS);
  }
  return db;
}

test("only the current lease can complete or fail a refresh", async (t) => {
  const { sqlite } = await fixture(t);
  const oldLease = await acquireRefreshLease("owner-a", "profile-a");
  assert.equal(typeof oldLease, "object");
  assert.equal(await acquireRefreshLease("owner-a", "profile-a"), null);
  sqlite.prepare("UPDATE health_sync_state_profile SET lock_expires_at = '2000-01-01T00:00:00.000Z' WHERE profile_id = 'profile-a'").run();
  const lease = await acquireRefreshLease("owner-a", "profile-a");
  assert.notEqual(lease.id, oldLease.id);
  const context = { ownerId: "owner-a", profileId: "profile-a", lease: oldLease, completedAt: new Date().toISOString(), range: { start: "2026-09-01", end: "2026-09-04" }, rowCount: 1 };
  await assert.rejects(markRefreshSuccess(context), /lease/i);
  await assert.rejects(markRefreshFailure({ ...context, failedAt: context.completedAt, safeErrorCode: "unexpected" }), /lease/i);
  assert.equal(sqlite.prepare("SELECT lease_id FROM health_sync_state_profile WHERE profile_id = 'profile-a'").get().lease_id, lease.id);
  await markRefreshSuccess({ ...context, lease });
  assert.equal(sqlite.prepare("SELECT status FROM health_sync_state_profile WHERE profile_id = 'profile-a'").get().status, "succeeded");
});

test("reconnection invalidates an in-flight refresh before it can replace credentials or health rows", async (t) => {
  const { sqlite } = await fixture(t);
  const lease = await acquireRefreshLease("owner-a", "profile-a");
  const reconnected = { ...TOKENS, accessToken: "synthetic-new-connection" };
  await saveTokenSet("owner-a", "profile-a", reconnected);
  await assert.rejects(replaceTokenSet("owner-a", "profile-a", TOKENS, lease), /lease/i);
  await assert.rejects(writeHealthRecords("owner-a", "profile-a", [{ date: "2026-09-04", steps: 42 }], new Date().toISOString(), lease), /lease/i);
  assert.equal((await loadTokenSet("owner-a", "profile-a")).accessToken, reconnected.accessToken);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM health_daily_profile").get().count, 0);
});

test("a valid lease writes only its profile and cannot resurrect a deleted profile", async (t) => {
  const { sqlite } = await fixture(t);
  const lease = await acquireRefreshLease("owner-a", "profile-a");
  const records = [{ date: "2026-09-04", steps: 42 }];
  await writeHealthRecords("owner-a", "profile-a", records, new Date().toISOString(), lease);
  await assert.rejects(writeHealthRecords("owner-b", "profile-b", records, new Date().toISOString(), lease), /lease/i);
  await assert.rejects(replaceTokenSet("owner-b", "profile-b", TOKENS, lease), /lease/i);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM health_daily_profile WHERE owner_id = 'owner-b'").get().count, 0);
  sqlite.prepare("DELETE FROM health_profiles WHERE id = 'profile-a'").run();
  await assert.rejects(replaceTokenSet("owner-a", "profile-a", TOKENS, lease), /lease/i);
  await assert.rejects(writeHealthRecords("owner-a", "profile-a", records, new Date().toISOString(), lease), /lease/i);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM oura_credentials WHERE owner_id = 'owner-a'").get().count, 0);
});

test("an expired lease cannot mutate data, credentials, or profile status even without a successor", async (t) => {
  const { sqlite } = await fixture(t);
  const lease = await acquireRefreshLease("owner-a", "profile-a");
  await writeHealthRecords("owner-a", "profile-a", [{ date: "2026-09-04", steps: 100 }], new Date().toISOString(), lease);
  sqlite.prepare("UPDATE health_sync_state_profile SET lock_expires_at = '2000-01-01T00:00:00.000Z' WHERE profile_id = 'profile-a'").run();
  await assert.rejects(writeHealthRecords("owner-a", "profile-a", [{ date: "2026-09-04", steps: 1 }], new Date().toISOString(), lease), /lease/i);
  await assert.rejects(replaceTokenSet("owner-a", "profile-a", { ...TOKENS, accessToken: "late-synthetic-token" }, lease), /lease/i);
  await assert.rejects(markRefreshReauthorizationRequired("owner-a", "profile-a", lease), /lease/i);
  assert.equal(sqlite.prepare("SELECT steps FROM health_daily_profile WHERE profile_id = 'profile-a'").get().steps, 100);
  assert.equal(sqlite.prepare("SELECT status FROM health_profiles WHERE id = 'profile-a'").get().status, "connected");
  assert.equal((await loadTokenSet("owner-a", "profile-a")).accessToken, TOKENS.accessToken);
});

test("multi-chunk writes stay inside D1 bind limits and retry idempotently", async (t) => {
  const { sqlite } = await fixture(t);
  const lease = await acquireRefreshLease("owner-a", "profile-a");
  const records = Array.from({ length: 8 }, (_, index) => ({ date: `2026-09-0${index + 1}`, steps: index }));
  await writeHealthRecords("owner-a", "profile-a", records, new Date().toISOString(), lease);
  await writeHealthRecords("owner-a", "profile-a", records, new Date().toISOString(), lease);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM health_daily_profile WHERE profile_id = 'profile-a'").get().count, 8);
});
