import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ensureHealthAccountWithRepository,
} from "../../../features/profile-management/server/profile-service.ts";
import {
  normalizeProfileSlug,
  parseProfileId,
} from "../../../features/profile-management/domain/validation.ts";

test("health schema makes every hosted Oura record tenant-owned", async () => {
  const schema = await readFile(
    new URL("../../../platform/database/schema.ts", import.meta.url),
    "utf8",
  );

  assert.match(schema, /export const healthAccounts/);
  assert.match(schema, /export const healthProfiles/);
  assert.match(schema, /export const ouraCredentials/);
  assert.match(schema, /export const ouraOAuthStates/);
  assert.match(
    schema,
    /primaryKey\(\{\s*columns:\s*\[\s*table\.ownerId,\s*table\.profileId,\s*table\.date\s*\]/s,
  );
  assert.match(
    schema,
    /primaryKey\(\{\s*columns:\s*\[\s*table\.ownerId,\s*table\.profileId\s*\]/s,
  );
  assert.match(schema, /health_profiles_owner_slug_uidx/);
  assert.match(schema, /health_profiles_owner_id_uidx/);
});

test("profile color migration preserves current order colors safely", async () => {
  const [schema, migration] = await Promise.all([
    readFile(
      new URL("../../../platform/database/schema.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../drizzle/0007_profile_colors.sql", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(schema, /colorKey:\s*text\("color_key"\)/);
  assert.match(
    migration,
    /ALTER TABLE `health_profiles` ADD `color_key` text/,
  );
  assert.match(
    migration,
    /UPDATE health_profiles[\s\S]*sort_order\s*%\s*6/i,
  );
  for (const key of [
    "ocean",
    "berry",
    "meadow",
    "sunset",
    "iris",
    "lagoon",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.match(migration, /WHERE color_key IS NULL/i);
});

test("profile slugs are tenant-local and generated from display names", () => {
  assert.equal(normalizeProfileSlug("Grandma Morgan"), "grandma-morgan");
  assert.equal(normalizeProfileSlug("  A___B  "), "a-b");
  assert.equal(normalizeProfileSlug("Élodie"), "elodie");
  assert.equal(normalizeProfileSlug("Family"), "family-member");
  assert.throws(() => parseProfileId("../../../member-one"));
  assert.equal(parseProfileId("legacy-member-one"), "legacy-member-one");
});

test("account bootstrap finds or creates without reassigning another tenant", async () => {
  const accounts = new Map();
  let creates = 0;
  const repository = {
    async findAccount(ownerId) {
      return accounts.get(ownerId) ?? null;
    },
    async createAccount(ownerId, createdAt) {
      creates += 1;
      const account = { ownerId, createdAt, legacyClaimedAt: null };
      accounts.set(ownerId, account);
      return account;
    },
  };
  const now = new Date("2026-08-01T12:00:00.000Z");

  const first = await ensureHealthAccountWithRepository(repository, "owner-a", now);
  const firstAgain = await ensureHealthAccountWithRepository(repository, "owner-a", now);
  const second = await ensureHealthAccountWithRepository(repository, "owner-b", now);

  assert.deepEqual(first, {
    ownerId: "owner-a",
    createdAt: now.toISOString(),
    legacyClaimedAt: null,
  });
  assert.deepEqual(firstAgain, first);
  assert.equal(second.ownerId, "owner-b");
  assert.equal(creates, 2);
});
