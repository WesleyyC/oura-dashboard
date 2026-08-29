import assert from "node:assert/strict";
import test from "node:test";

import {
  enforceRequestRateLimit,
  rateLimitScopeForRequest,
} from "../../../platform/security/rate-limit.ts";

const KEY = "ERERERERERERERERERERERERERERERERERERERERERE";
const NOW = new Date("2026-08-01T12:00:00.000Z");

function memoryRepository() {
  const buckets = new Map();
  return {
    buckets,
    async deleteExpired(cutoff) {
      for (const [key, bucket] of buckets) {
        if (bucket.expiresAt <= cutoff) buckets.delete(key);
      }
    },
    async consume(input) {
      const key = `${input.scope}\0${input.actorDigest}`;
      const previous = buckets.get(key);
      const requestCount = !previous || previous.windowStartedAt !== input.windowStartedAt
        ? 1
        : previous.requestCount + 1;
      buckets.set(key, { ...input, requestCount });
      return requestCount;
    },
  };
}

test("request policies cover only the approved mutation routes", () => {
  const cases = [
    ["POST", "/api/profiles", "owner_profile_mutation"],
    ["PATCH", "/api/profiles", "owner_profile_mutation"],
    ["DELETE", "/api/profiles", "owner_profile_mutation"],
    ["DELETE", "/api/account", "owner_profile_mutation"],
    ["POST", "/api/oura/authorize", "owner_oauth_start"],
    ["POST", "/api/oura/invites", "owner_oauth_start"],
    ["DELETE", "/api/oura/invites", "owner_oauth_start"],
    ["POST", "/api/oura/refresh", "owner_refresh"],
    ["POST", "/api/oura/guest/inspect", "guest_invite_inspect"],
    ["POST", "/api/oura/guest/authorize", "guest_invite_authorize"],
  ];
  for (const [method, path, expected] of cases) {
    assert.equal(
      rateLimitScopeForRequest(new Request(`https://health.example${path}`, { method })),
      expected,
    );
  }
  assert.equal(
    rateLimitScopeForRequest(new Request("https://health.example/api/health")),
    null,
  );
  assert.equal(
    rateLimitScopeForRequest(new Request("https://health.example/api/oura/callback")),
    null,
  );
});

test("owner buckets store only a keyed digest and return a private 429", async () => {
  const repository = memoryRepository();
  const request = new Request("https://health.example/api/profiles", {
    method: "POST",
    headers: {
      "oai-authenticated-user-id": "owner-private-value",
      "oai-authenticated-user-email": "owner@example.com",
    },
  });
  let response = null;
  for (let attempt = 0; attempt < 31; attempt += 1) {
    response = await enforceRequestRateLimit(request, {
      repository,
      keyText: KEY,
      now: NOW,
    });
  }

  assert.ok(response);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { error: "rate_limited" });
  const [bucket] = repository.buckets.values();
  assert.doesNotMatch(JSON.stringify(bucket), /owner-private-value|owner@example\.com/);
  assert.match(bucket.actorDigest, /^[A-Za-z0-9_-]{43}$/);
});

test("guest authorization resets after its ten-request fixed window", async () => {
  const repository = memoryRepository();
  const request = new Request("https://health.example/api/oura/guest/authorize", {
    method: "POST",
    headers: { "cf-connecting-ip": "2001:db8::5" },
  });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(await enforceRequestRateLimit(request, {
      repository,
      keyText: KEY,
      now: NOW,
    }), null);
  }
  const limited = await enforceRequestRateLimit(request, {
    repository,
    keyText: KEY,
    now: NOW,
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(JSON.stringify([...repository.buckets.values()]), /2001:db8::5/);

  assert.equal(await enforceRequestRateLimit(request, {
    repository,
    keyText: KEY,
    now: new Date("2026-08-01T12:01:00.000Z"),
  }), null);
});

test("actor digests separate owners, policies, and UTC days", async () => {
  const seen = [];
  const repository = {
    async deleteExpired() {},
    async consume(input) {
      seen.push(input.actorDigest);
      return 1;
    },
  };
  const ownerRequest = (ownerId, path) => new Request(`https://health.example${path}`, {
    method: "POST",
    headers: {
      "oai-authenticated-user-id": ownerId,
      "oai-authenticated-user-email": `${ownerId}@example.com`,
    },
  });

  await enforceRequestRateLimit(ownerRequest("owner-a", "/api/profiles"), {
    repository, keyText: KEY, now: NOW,
  });
  await enforceRequestRateLimit(ownerRequest("owner-b", "/api/profiles"), {
    repository, keyText: KEY, now: NOW,
  });
  await enforceRequestRateLimit(ownerRequest("owner-a", "/api/oura/authorize"), {
    repository, keyText: KEY, now: NOW,
  });
  await enforceRequestRateLimit(ownerRequest("owner-a", "/api/profiles"), {
    repository,
    keyText: KEY,
    now: new Date("2026-08-02T12:00:00.000Z"),
  });

  assert.equal(new Set(seen).size, 4);
  assert.doesNotMatch(JSON.stringify(seen), /owner-a|owner-b|example\.com/);
});

test("missing authentication is not charged to an owner bucket", async () => {
  const repository = memoryRepository();
  const response = await enforceRequestRateLimit(
    new Request("https://health.example/api/profiles", { method: "POST" }),
    { repository, keyText: KEY, now: NOW },
  );
  assert.equal(response, null);
  assert.equal(repository.buckets.size, 0);
});

test("invalid rate-limit keys fail without reflecting their value", async () => {
  const repository = memoryRepository();
  const secret = "not-a-32-byte-key";
  await assert.rejects(
    enforceRequestRateLimit(
      new Request("https://health.example/api/oura/guest/inspect", {
        method: "POST",
        headers: { "cf-connecting-ip": "192.0.2.1" },
      }),
      { repository, keyText: secret, now: NOW },
    ),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(secret));
      return /configuration/i.test(error.message);
    },
  );
});
