import assert from "node:assert/strict";
import test from "node:test";

import {
  cancelConnectionInvite,
  ConnectionInviteError,
  consumeConnectionInvite,
  inspectConnectionInvite,
  issueConnectionInvite,
} from "../../../features/oura-connection/server/invite-service.ts";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const REQUEST = new Request("https://health.example/settings");

function memoryRepository() {
  const records = new Map();
  const profileHashes = new Map();
  return {
    records,
    async deleteExpired(cutoff) {
      for (const [inviteHash, record] of records) {
        if (record.expiresAt > cutoff) continue;
        records.delete(inviteHash);
        profileHashes.delete(`${record.ownerId}\0${record.profileId}`);
      }
    },
    async replace(record) {
      const profileKey = `${record.ownerId}\0${record.profileId}`;
      const previousHash = profileHashes.get(profileKey);
      if (previousHash) records.delete(previousHash);
      records.set(record.inviteHash, structuredClone(record));
      profileHashes.set(profileKey, record.inviteHash);
    },
    async inspect(inviteHash) {
      return records.has(inviteHash)
        ? structuredClone(records.get(inviteHash))
        : null;
    },
    async take(inviteHash) {
      const record = records.get(inviteHash);
      if (!record) return null;
      records.delete(inviteHash);
      profileHashes.delete(`${record.ownerId}\0${record.profileId}`);
      return structuredClone(record);
    },
    async cancel(ownerId, profileId) {
      const profileKey = `${ownerId}\0${profileId}`;
      const inviteHash = profileHashes.get(profileKey);
      if (!inviteHash) return;
      profileHashes.delete(profileKey);
      records.delete(inviteHash);
    },
  };
}

function isUnavailable(error) {
  return error instanceof ConnectionInviteError && error.code === "unavailable";
}

test("issued invitations persist only a hash and use a fragment URL", async () => {
  const repository = memoryRepository();
  const invitation = await issueConnectionInvite(
    "owner-a",
    "profile-a",
    REQUEST,
    NOW,
    { repository },
  );

  assert.match(invitation.rawInvite, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(invitation.expiresAt, "2026-08-01T12:10:00.000Z");
  assert.equal(
    invitation.connectUrl,
    `https://health.example/connect/oura#invite=${invitation.rawInvite}`,
  );
  assert.equal(repository.records.size, 1);
  assert.ok(!repository.records.has(invitation.rawInvite));
  const [stored] = repository.records.values();
  assert.deepEqual(Object.keys(stored).sort(), [
    "createdAt",
    "expiresAt",
    "inviteHash",
    "ownerId",
    "profileId",
  ]);
  assert.equal(stored.ownerId, "owner-a");
  assert.equal(stored.profileId, "profile-a");
});

test("inspection validates without consuming the invitation", async () => {
  const repository = memoryRepository();
  const invitation = await issueConnectionInvite(
    "owner-a",
    "profile-a",
    REQUEST,
    NOW,
    { repository },
  );

  const expected = {
    ownerId: "owner-a",
    profileId: "profile-a",
    expiresAt: "2026-08-01T12:10:00.000Z",
  };
  assert.deepEqual(
    await inspectConnectionInvite(invitation.rawInvite, NOW, { repository }),
    expected,
  );
  assert.deepEqual(
    await inspectConnectionInvite(invitation.rawInvite, NOW, { repository }),
    expected,
  );
  assert.equal(repository.records.size, 1);
});

test("consumption is single-use even for concurrent submissions", async () => {
  const repository = memoryRepository();
  const invitation = await issueConnectionInvite(
    "owner-a",
    "profile-a",
    REQUEST,
    NOW,
    { repository },
  );

  const results = await Promise.allSettled([
    consumeConnectionInvite(invitation.rawInvite, NOW, { repository }),
    consumeConnectionInvite(invitation.rawInvite, NOW, { repository }),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  const rejected = results.find(({ status }) => status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(isUnavailable(rejected.reason));
});

test("rotating a profile invitation invalidates only its predecessor", async () => {
  const repository = memoryRepository();
  const first = await issueConnectionInvite(
    "owner-a", "profile-a", REQUEST, NOW, { repository },
  );
  const other = await issueConnectionInvite(
    "owner-a", "profile-b", REQUEST, NOW, { repository },
  );
  const second = await issueConnectionInvite(
    "owner-a", "profile-a", REQUEST, NOW, { repository },
  );

  await assert.rejects(
    inspectConnectionInvite(first.rawInvite, NOW, { repository }),
    isUnavailable,
  );
  assert.deepEqual(
    await consumeConnectionInvite(second.rawInvite, NOW, { repository }),
    {
      ownerId: "owner-a",
      profileId: "profile-a",
      expiresAt: "2026-08-01T12:10:00.000Z",
    },
  );
  assert.equal(
    (await inspectConnectionInvite(other.rawInvite, NOW, { repository })).profileId,
    "profile-b",
  );
});

test("cancellation is scoped to the exact owner and profile", async () => {
  const repository = memoryRepository();
  const invitation = await issueConnectionInvite(
    "owner-a", "profile-a", REQUEST, NOW, { repository },
  );

  await cancelConnectionInvite("owner-b", "profile-a", { repository });
  assert.equal(
    (await inspectConnectionInvite(invitation.rawInvite, NOW, { repository })).ownerId,
    "owner-a",
  );
  await cancelConnectionInvite("owner-a", "profile-a", { repository });
  await assert.rejects(
    inspectConnectionInvite(invitation.rawInvite, NOW, { repository }),
    isUnavailable,
  );
});

test("malformed, expired, canceled, and reused invitations fail identically", async () => {
  const repository = memoryRepository();
  const expired = await issueConnectionInvite(
    "owner-a", "profile-expired", REQUEST, NOW, { repository },
  );
  const canceled = await issueConnectionInvite(
    "owner-a", "profile-canceled", REQUEST, NOW, { repository },
  );
  const reused = await issueConnectionInvite(
    "owner-a", "profile-reused", REQUEST, NOW, { repository },
  );
  await cancelConnectionInvite("owner-a", "profile-canceled", { repository });
  await consumeConnectionInvite(reused.rawInvite, NOW, { repository });

  const attempts = [
    () => inspectConnectionInvite("", NOW, { repository }),
    () => inspectConnectionInvite("x".repeat(257), NOW, { repository }),
    () => inspectConnectionInvite(
      expired.rawInvite,
      new Date("2026-08-01T12:10:00.001Z"),
      { repository },
    ),
    () => inspectConnectionInvite(canceled.rawInvite, NOW, { repository }),
    () => consumeConnectionInvite(reused.rawInvite, NOW, { repository }),
  ];
  for (const attempt of attempts) {
    await assert.rejects(attempt, (error) => {
      assert.ok(isUnavailable(error));
      assert.equal(error.message, "Connection invitation unavailable");
      return true;
    });
  }
});

test("connection URLs reject non-HTTPS public origins", async () => {
  const repository = memoryRepository();
  await assert.rejects(
    issueConnectionInvite(
      "owner-a",
      "profile-a",
      new Request("http://health.example/settings"),
      NOW,
      { repository },
    ),
    isUnavailable,
  );
  assert.equal(repository.records.size, 0);
});

test("issuing an invitation prunes expired rows without touching live capabilities", async () => {
  const repository = memoryRepository();
  const future = await issueConnectionInvite(
    "owner-a",
    "profile-future",
    REQUEST,
    NOW,
    { repository },
  );
  repository.records.set("expired-hash", {
    inviteHash: "expired-hash",
    ownerId: "owner-a",
    profileId: "profile-expired",
    expiresAt: "2026-08-01T11:59:59.999Z",
    createdAt: "2026-08-01T11:49:59.999Z",
  });
  const created = await issueConnectionInvite(
    "owner-a",
    "profile-new",
    REQUEST,
    NOW,
    { repository },
  );

  assert.equal(repository.records.has("expired-hash"), false);
  assert.equal(
    (await inspectConnectionInvite(future.rawInvite, NOW, { repository })).profileId,
    "profile-future",
  );
  assert.equal(
    (await consumeConnectionInvite(created.rawInvite, NOW, { repository })).profileId,
    "profile-new",
  );
});
