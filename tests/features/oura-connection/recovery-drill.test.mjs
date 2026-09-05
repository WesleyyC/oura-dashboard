import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createD1Fixture } from "../../platform/database/d1-fixture.mjs";
import { encryptTokenSet, decryptTokenSet } from "../../../features/oura-connection/server/token-crypto.ts";

const oldKey = Buffer.alloc(32, 3).toString("base64url");
const newKey = Buffer.alloc(32, 4).toString("base64url");
const tokens = { accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: "2099-01-01T00:00:00.000Z", grantedScopes: ["daily", "workout"] };

test("synthetic backup, dry-run rotation, restore and decryption preserve isolation without changing the source", async (t) => {
  const { prepareRecoveryCopy } = await import("../../../scripts/recovery/rotate-vault.mjs").catch(() => ({}));
  assert.equal(typeof prepareRecoveryCopy, "function");
  const { sqlite } = await createD1Fixture(t);
  const directory = await mkdtemp(path.join(tmpdir(), "oura-synthetic-recovery-"));
  const sourcePath = path.join(directory, "source.sqlite");
  const outputPath = path.join(directory, "rotated.sqlite");
  const now = "2026-09-04T12:00:00.000Z";
  for (const suffix of ["a", "b"]) {
    const context = { ownerId: `owner-${suffix}`, profileId: `profile-${suffix}`, version: 1 };
    sqlite.prepare("INSERT INTO health_accounts(owner_id, created_at) VALUES (?, ?)").run(context.ownerId, now);
    sqlite.prepare("INSERT INTO health_profiles(id, owner_id, slug, display_name, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, 'Synthetic', 0, 'connected', ?, ?)")
      .run(context.profileId, context.ownerId, `person-${suffix}`, now, now);
    const encrypted = await encryptTokenSet(tokens, context, oldKey);
    sqlite.prepare("INSERT INTO oura_credentials VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(context.ownerId, context.profileId, encrypted.ciphertext, encrypted.nonce, 1, tokens.expiresAt, JSON.stringify(tokens.grantedScopes), now);
    sqlite.prepare("INSERT INTO health_daily_profile(owner_id, profile_id, date, steps, ingested_at) VALUES (?, ?, '2026-09-04', 42, ?)").run(context.ownerId, context.profileId, now);
    sqlite.prepare("INSERT INTO oura_oauth_states(state_hash, owner_id, profile_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(`synthetic-state-${suffix}`, context.ownerId, context.profileId, now, now);
    sqlite.prepare("INSERT INTO oura_connection_invites VALUES (?, ?, ?, ?, ?)").run(`synthetic-invite-${suffix}`, context.ownerId, context.profileId, now, now);
    sqlite.prepare("INSERT INTO health_sync_state_profile(owner_id, profile_id, start_date, end_date, row_count, updated_at, status, lease_id, lock_expires_at) VALUES (?, ?, '2026-03-04', '2026-09-04', 1, ?, 'refreshing', 'synthetic-lease', '2099-01-01T00:00:00.000Z')")
      .run(context.ownerId, context.profileId, now);
  }
  sqlite.prepare("VACUUM INTO ?").run(sourcePath);
  const before = await readFile(sourcePath);
  const dryRun = await prepareRecoveryCopy({ sourcePath, outputPath, oldKey, newKey });
  assert.deepEqual(dryRun, { mode: "dry-run", credentialCount: 2, profileCount: 2, databaseVerified: true });
  await assert.rejects(stat(outputPath), { code: "ENOENT" });
  await assert.rejects(prepareRecoveryCopy({ sourcePath, outputPath, oldKey: newKey, newKey: oldKey, apply: true }), /Recovery validation failed/);
  await assert.rejects(stat(outputPath), { code: "ENOENT" });
  await prepareRecoveryCopy({ sourcePath, outputPath, oldKey, newKey, apply: true });
  assert.deepEqual(await readFile(sourcePath), before);
  assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  await assert.rejects(prepareRecoveryCopy({ sourcePath, outputPath, oldKey, newKey, apply: true }), /Recovery validation failed/);
  const restored = new DatabaseSync(outputPath, { readOnly: true });
  t.after(() => restored.close());
  assert.equal(restored.prepare("SELECT count(*) AS n FROM health_daily_profile").get().n, 2);
  assert.equal(restored.prepare("SELECT count(*) AS n FROM oura_oauth_states").get().n, 0);
  assert.equal(restored.prepare("SELECT count(*) AS n FROM oura_connection_invites").get().n, 0);
  assert.equal(restored.prepare("SELECT count(*) AS n FROM health_sync_state_profile WHERE lease_id IS NOT NULL OR lock_expires_at IS NOT NULL").get().n, 0);
  assert.equal(restored.prepare("SELECT count(*) AS n FROM health_sync_state_profile WHERE status = 'failed' AND safe_error_code = 'refresh_interrupted'").get().n, 2);
  for (const row of restored.prepare("SELECT * FROM oura_credentials").all()) {
    const context = { ownerId: row.owner_id, profileId: row.profile_id, version: row.encryption_version };
    const encrypted = { ciphertext: row.ciphertext, nonce: row.nonce, encryptionVersion: row.encryption_version };
    assert.deepEqual(await decryptTokenSet(encrypted, context, newKey), tokens);
    await assert.rejects(decryptTokenSet(encrypted, context, oldKey));
    await assert.rejects(decryptTokenSet(encrypted, { ...context, ownerId: "wrong-owner" }, newKey));
  }
  assert.deepEqual(await prepareRecoveryCopy({ sourcePath: outputPath, oldKey: newKey }), { mode: "verify", credentialCount: 2, profileCount: 2, databaseVerified: true });
  const damaged = new DatabaseSync(sourcePath);
  t.after(() => damaged.close());
  for (const column of ["expires_at", "granted_scopes"]) {
    const original = damaged.prepare(`SELECT ${column} AS value FROM oura_credentials WHERE profile_id = 'profile-a'`).get().value;
    damaged.prepare(`UPDATE oura_credentials SET ${column} = ? WHERE profile_id = 'profile-a'`).run("synthetic-mismatch");
    await assert.rejects(prepareRecoveryCopy({ sourcePath, oldKey }), /Recovery validation failed/);
    damaged.prepare(`UPDATE oura_credentials SET ${column} = ? WHERE profile_id = 'profile-a'`).run(original);
  }
});
