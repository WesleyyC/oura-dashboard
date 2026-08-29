import assert from "node:assert/strict";
import test from "node:test";

import {
  createProfileService,
  MAX_HEALTH_PROFILES,
  ProfileLimitReachedError,
  ProfileNotFoundError,
} from "../../../features/profile-management/server/profile-service.ts";

function memoryRepository() {
  const accounts = new Map();
  const profiles = new Map();
  const credentials = new Set();
  const ownerProfiles = (ownerId) =>
    [...profiles.values()]
      .filter((profile) => profile.ownerId === ownerId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const summary = (profile) => {
    const result = { ...profile };
    delete result.ownerId;
    return result;
  };

  return {
    accounts,
    profiles,
    credentials,
    async findAccount(ownerId) {
      return accounts.get(ownerId) ?? null;
    },
    async createAccount(ownerId, createdAt) {
      const account = accounts.get(ownerId) ?? {
        ownerId,
        createdAt,
        legacyClaimedAt: null,
      };
      accounts.set(ownerId, account);
      return account;
    },
    async listProfiles(ownerId) {
      return ownerProfiles(ownerId).map(summary);
    },
    async getProfile(ownerId, profileId) {
      const profile = profiles.get(profileId);
      return profile?.ownerId === ownerId ? summary(profile) : null;
    },
    async insertPendingProfile(input) {
      const profile = {
        ...input,
        status: "pending",
        lastSucceededAt: null,
        coverageStartDate: null,
        safeErrorCode: null,
      };
      profiles.set(input.id, profile);
      return summary(profile);
    },
    async updateProfile(ownerId, profileId, updates) {
      const profile = profiles.get(profileId);
      if (profile?.ownerId === ownerId) profiles.set(profileId, { ...profile, ...updates });
    },
    async hasCredential(ownerId, profileId) {
      return credentials.has(`${ownerId}\0${profileId}`);
    },
    async removeProfile(ownerId, profileId) {
      const profile = profiles.get(profileId);
      if (profile?.ownerId === ownerId) profiles.delete(profileId);
    },
    async deleteAccount(ownerId) {
      accounts.delete(ownerId);
      for (const profile of ownerProfiles(ownerId)) profiles.delete(profile.id);
    },
  };
}

test("account setup is idempotent and validates trusted owner IDs", async () => {
  const repository = memoryRepository();
  const service = createProfileService(repository);
  const now = new Date("2026-08-01T12:00:00.000Z");

  const first = await service.ensureAccount("owner-a", now);
  assert.deepEqual(await service.ensureAccount("owner-a", now), first);
  assert.equal(repository.accounts.size, 1);
  await assert.rejects(() => service.ensureAccount(" owner-a", now), /Trusted owner ID/);
});

test("profile creation allocates unique slugs, stable colors, and enforces the limit", async () => {
  const repository = memoryRepository();
  const service = createProfileService(repository);
  const first = await service.createPendingProfile("owner-a", "Grandma Morgan");
  const second = await service.createPendingProfile("owner-a", "Grandma Morgan");

  assert.equal(first.slug, "grandma-morgan");
  assert.equal(first.colorKey, "ocean");
  assert.equal(second.slug, "grandma-morgan-2");
  assert.equal(second.colorKey, "berry");
  assert.deepEqual(
    (await service.listProfiles("owner-a")).map(({ colorKey }) => colorKey),
    ["ocean", "berry"],
  );

  for (let index = 2; index < MAX_HEALTH_PROFILES; index += 1) {
    await service.createPendingProfile("owner-a", `Person ${index}`);
  }
  await assert.rejects(
    () => service.createPendingProfile("owner-a", "One too many"),
    ProfileLimitReachedError,
  );
});

test("profile updates preserve owner scope and re-enable from credential state", async () => {
  const repository = memoryRepository();
  const service = createProfileService(repository);
  const profile = await service.createPendingProfile("owner-a", "Alex");

  const changed = await service.updateProfile("owner-a", {
    profileId: profile.id,
    displayName: "Alex Morgan",
    colorKey: "iris",
    sortOrder: 7,
    disabled: true,
  });
  assert.equal(changed.displayName, "Alex Morgan");
  assert.equal(changed.colorKey, "iris");
  assert.equal(changed.sortOrder, 7);
  assert.equal(changed.status, "disabled");

  assert.equal(
    (await service.updateProfile("owner-a", { profileId: profile.id, disabled: false })).status,
    "pending",
  );
  await service.updateProfile("owner-a", { profileId: profile.id, disabled: true });
  repository.credentials.add(`owner-a\0${profile.id}`);
  assert.equal(
    (await service.updateProfile("owner-a", { profileId: profile.id, disabled: false })).status,
    "connected",
  );
  await assert.rejects(
    () => service.updateProfile("owner-b", { profileId: profile.id, disabled: true }),
    ProfileNotFoundError,
  );
});

test("status changes, removal, and account deletion are owner-scoped", async () => {
  const repository = memoryRepository();
  const service = createProfileService(repository);
  const profile = await service.createPendingProfile("owner-a", "Alex");

  await service.markProfileConnected("owner-a", profile.id);
  assert.equal((await service.getProfile("owner-a", profile.id)).status, "connected");
  await service.markProfileReauthorizationRequired("owner-a", profile.id);
  assert.equal(
    (await service.getProfile("owner-a", profile.id)).status,
    "reauthorization_required",
  );
  await assert.rejects(
    () => service.removeProfile("owner-b", profile.id),
    ProfileNotFoundError,
  );
  await service.removeProfile("owner-a", profile.id);
  assert.equal(await service.getProfile("owner-a", profile.id), null);

  await service.createPendingProfile("owner-a", "Again");
  await service.deleteAccount("owner-a");
  assert.equal(repository.accounts.has("owner-a"), false);
  assert.equal((await repository.listProfiles("owner-a")).length, 0);
});
