import assert from "node:assert/strict";
import test from "node:test";
import { createD1Fixture } from "../../platform/database/d1-fixture.mjs";
import { setRuntimeEnv } from "../../../platform/runtime/server.ts";

test("diagnostics select only owner-scoped sync metadata, sanitize errors, and detect expired work", async (t) => {
  const { loadRefreshDiagnostics } = await import("../../../features/oura-connection/server/diagnostics.ts").catch(() => ({}));
  assert.equal(typeof loadRefreshDiagnostics, "function");
  const { sqlite, binding } = await createD1Fixture(t);
  setRuntimeEnv({ DB: binding });
  const now = "2026-09-04T12:10:00.000Z";
  for (const suffix of ["a", "b"]) {
    sqlite.prepare("INSERT INTO health_accounts(owner_id, created_at) VALUES (?, ?)").run(`owner-${suffix}`, now);
    sqlite.prepare("INSERT INTO health_profiles(id, owner_id, slug, display_name, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'connected', ?, ?)")
      .run(`profile-${suffix}`, `owner-${suffix}`, `person-${suffix}`, "PRIVATE-NAME", now, now);
    sqlite.prepare("INSERT INTO health_sync_state_profile(owner_id, profile_id, start_date, end_date, row_count, updated_at, last_attempt_at, last_succeeded_at, status, safe_error_code, lock_expires_at, lease_id) VALUES (?, ?, '2026-03-04', '2026-09-04', 3, '2026-09-04T12:00:00.000Z', '2026-09-04T12:00:00.000Z', '2026-09-03T12:00:00.000Z', 'refreshing', 'PRIVATE-ERROR', '2026-09-04T12:05:00.000Z', 'PRIVATE-LEASE')")
      .run(`owner-${suffix}`, `profile-${suffix}`);
  }
  const report = await loadRefreshDiagnostics("owner-a", new Date(now));
  assert.equal(report.profiles.length, 1);
  assert.deepEqual(report.profiles[0], {
    profileId: "profile-a", status: "interrupted", lastAttemptAt: "2026-09-04T12:00:00.000Z",
    lastSucceededAt: "2026-09-03T12:00:00.000Z", durationMs: null,
    lastSuccessfulRowCount: 3, safeErrorCode: "refresh_interrupted",
  });
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|owner-|profile-b|ciphertext|nonce|steps|startDate/);
  sqlite.prepare("UPDATE health_sync_state_profile SET status = 'failed', updated_at = '2026-09-04T12:00:12.000Z', lock_expires_at = NULL WHERE profile_id = 'profile-a'").run();
  const completed = (await loadRefreshDiagnostics("owner-a", new Date(now))).profiles[0];
  assert.equal(completed.durationMs, 12000);
  assert.equal(completed.safeErrorCode, "unexpected");
  assert.deepEqual((await loadRefreshDiagnostics("missing-owner")).profiles, []);
});
