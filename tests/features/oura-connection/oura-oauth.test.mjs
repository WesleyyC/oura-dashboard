import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAuthorizationUrl,
  callbackUriFor,
  consumeOAuthState,
  exchangeAuthorizationCode,
  issueOAuthState,
  refreshOAuthTokens,
  SafeOuraError,
} from "../../../features/oura-connection/server/oauth-service.ts";

const CONFIG = {
  clientId: "client-id",
  clientSecret: "client-secret-hidden",
  redirectUri: "https://health.example/api/oura/callback",
  scopes: ["daily", "workout"],
};
const GUEST_CONFIG = {
  ...CONFIG,
  redirectUri: "https://health.example/api/oura/guest/callback",
};
const NOW = new Date("2026-07-30T12:00:00.000Z");

test("authorization URLs request only the dashboard scopes", () => {
  const url = new URL(buildAuthorizationUrl(CONFIG, "opaque-state"));

  assert.equal(
    url.origin + url.pathname,
    "https://cloud.ouraring.com/oauth/authorize",
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("redirect_uri"), CONFIG.redirectUri);
  assert.equal(url.searchParams.get("scope"), "daily workout");
  assert.equal(url.searchParams.get("state"), "opaque-state");
  assert.doesNotMatch(url.href, /client-secret-hidden/);
});

test("callback URI is derived only from HTTPS or local request origins", () => {
  assert.equal(
    callbackUriFor(new Request("https://health.example/settings"), "owner"),
    "https://health.example/api/oura/callback",
  );
  assert.equal(
    callbackUriFor(new Request("http://localhost:3000/settings"), "guest"),
    "http://localhost:3000/api/oura/guest/callback",
  );
  assert.equal(
    callbackUriFor(new Request("http://localhost:3000/settings"), "owner"),
    "http://localhost:3000/api/oura/callback",
  );
  assert.throws(
    () => callbackUriFor(new Request("http://health.example/settings"), "owner"),
    (error) =>
      error instanceof SafeOuraError &&
      error.code === "invalid_callback_origin",
  );
});

test("owner and guest authorization URLs retain their exact callback routes", () => {
  const owner = new URL(buildAuthorizationUrl(CONFIG, "owner-state"));
  const guest = new URL(buildAuthorizationUrl(GUEST_CONFIG, "guest-state"));
  assert.equal(owner.searchParams.get("redirect_uri"), CONFIG.redirectUri);
  assert.equal(guest.searchParams.get("redirect_uri"), GUEST_CONFIG.redirectUri);
});

test("authorization-code exchange posts the exact form without following redirects", async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return Response.json({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
      scope: "daily workout",
    });
  };

  const tokens = await exchangeAuthorizationCode(
    CONFIG,
    "authorization-code",
    fetchImpl,
    NOW,
  );

  assert.equal(captured.url, "https://api.ouraring.com/oauth/token");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.redirect, "manual");
  assert.equal(
    captured.init.headers["Content-Type"],
    "application/x-www-form-urlencoded",
  );
  assert.deepEqual(
    Object.fromEntries(new URLSearchParams(captured.init.body)),
    {
      grant_type: "authorization_code",
      code: "authorization-code",
      client_id: "client-id",
      client_secret: "client-secret-hidden",
      redirect_uri: CONFIG.redirectUri,
    },
  );
  assert.deepEqual(tokens, {
    accessToken: "new-access",
    refreshToken: "new-refresh",
    expiresAt: "2026-07-30T12:59:00.000Z",
    grantedScopes: ["daily", "workout"],
  });
});

test("token endpoint failures never reflect secrets, codes, or token bodies", async () => {
  const leakedValues = [
    CONFIG.clientSecret,
    "authorization-code",
    "old-refresh",
    "upstream-access",
    "upstream-refresh",
  ];
  const fetchImpl = async () => Response.json({
    error: CONFIG.clientSecret,
    error_description:
      "authorization-code old-refresh upstream-access upstream-refresh",
  }, { status: 400 });

  for (const operation of [
    () => exchangeAuthorizationCode(CONFIG, "authorization-code", fetchImpl, NOW),
    () => refreshOAuthTokens(CONFIG, "old-refresh", fetchImpl, NOW),
  ]) {
    await assert.rejects(operation, (error) => {
      assert.ok(error instanceof SafeOuraError);
      assert.equal(error.code, "token_exchange_failed");
      for (const value of leakedValues) {
        assert.doesNotMatch(error.message, new RegExp(value));
      }
      return true;
    });
  }
});

test("token endpoint classifies only whitelisted OAuth rejection codes", async () => {
  const cases = [
    ["invalid_request", "oauth_request_rejected"],
    ["invalid_client", "oauth_client_rejected"],
    ["invalid_grant", "oauth_grant_rejected"],
    ["invalid_scope", "oauth_scope_rejected"],
    ["unexpected_upstream_value", "token_exchange_failed"],
  ];

  for (const [upstreamCode, expectedCode] of cases) {
    const fetchImpl = async () => Response.json({
      status: 400,
      title: "OAuth request rejected",
      error: upstreamCode,
      error_description: `${CONFIG.clientSecret} authorization-code`,
    }, { status: 400 });

    await assert.rejects(
      exchangeAuthorizationCode(CONFIG, "authorization-code", fetchImpl, NOW),
      (error) => {
        assert.ok(error instanceof SafeOuraError);
        assert.equal(error.code, expectedCode);
        assert.doesNotMatch(error.message, /client-secret-hidden|authorization-code/);
        return true;
      },
    );
  }
});

test("token endpoint transport failures are distinct from Oura rejections", async () => {
  const fetchImpl = async () => {
    throw new TypeError("diagnostic transport failure");
  };

  await assert.rejects(
    exchangeAuthorizationCode(CONFIG, "authorization-code", fetchImpl, NOW),
    (error) => {
      assert.ok(error instanceof SafeOuraError);
      assert.equal(error.code, "token_endpoint_unavailable");
      assert.doesNotMatch(error.message, /diagnostic transport failure/);
      return true;
    },
  );
});

test("successful token responses classify invalid fields without exposing values", async () => {
  const cases = [
    [
      () => new Response("not-json", { status: 200 }),
      "token_payload_unreadable",
    ],
    [
      () => Response.json({
        refresh_token: "refresh-hidden",
        expires_in: 3600,
      }),
      "token_access_invalid",
    ],
    [
      () => Response.json({
        access_token: "access-hidden",
        expires_in: 3600,
      }),
      "token_refresh_invalid",
    ],
    [
      () => Response.json({
        access_token: "access-hidden",
        refresh_token: "refresh-hidden",
        expires_in: "3600",
      }),
      "token_expiry_invalid",
    ],
  ];

  for (const [response, expectedCode] of cases) {
    await assert.rejects(
      exchangeAuthorizationCode(CONFIG, "authorization-code", response, NOW),
      (error) => {
        assert.ok(error instanceof SafeOuraError);
        assert.equal(error.code, expectedCode);
        assert.doesNotMatch(error.message, /access-hidden|refresh-hidden/);
        return true;
      },
    );
  }
});

test("server token responses retain the requested scopes when scope metadata is non-authoritative", async () => {
  const fetchImpl = async () => Response.json({
    access_token: "new-access",
    refresh_token: "new-refresh",
    expires_in: 3600,
    scope: "daily",
  });

  const tokens = await exchangeAuthorizationCode(
    CONFIG,
    "authorization-code",
    fetchImpl,
    NOW,
  );

  assert.deepEqual(tokens.grantedScopes, ["daily", "workout"]);
});

test("single-use state returns its server-recorded owner and flow", async () => {
  const states = new Map();
  const repository = {
    async deleteExpired() {},
    async createState(record) {
      states.set(record.stateHash, record);
    },
    async takeState(stateHash) {
      const record = states.get(stateHash);
      if (!record) return null;
      states.delete(stateHash);
      return record;
    },
  };
  const options = { repository };

  const ownerState = await issueOAuthState(
    "owner-a", "profile-a", "owner", NOW, options,
  );
  const guestState = await issueOAuthState(
    "owner-a", "profile-b", "guest", NOW, options,
  );
  assert.equal(states.size, 2);
  assert.ok(!states.has(ownerState), "raw OAuth state must never be stored");
  assert.ok(!states.has(guestState), "raw OAuth state must never be stored");
  assert.deepEqual(
    await consumeOAuthState(ownerState, NOW, options),
    { ownerId: "owner-a", profileId: "profile-a", flow: "owner" },
  );
  assert.deepEqual(
    await consumeOAuthState(guestState, NOW, options),
    { ownerId: "owner-a", profileId: "profile-b", flow: "guest" },
  );
});

test("typed OAuth states reject invalid flow, reuse, and expiry", async () => {
  const states = new Map();
  const repository = {
    async deleteExpired() {},
    async createState(record) {
      states.set(record.stateHash, record);
    },
    async takeState(stateHash) {
      const record = states.get(stateHash);
      if (!record) return null;
      states.delete(stateHash);
      return record;
    },
  };
  const options = { repository };

  await assert.rejects(
    issueOAuthState("owner-a", "profile-a", "other", NOW, options),
    (error) => error instanceof SafeOuraError && error.code === "invalid_request",
  );

  const used = await issueOAuthState(
    "owner-a", "profile-a", "owner", NOW, options,
  );
  await consumeOAuthState(used, NOW, options);
  await assert.rejects(
    consumeOAuthState(used, NOW, options),
    (error) => error instanceof SafeOuraError && error.code === "invalid_oauth_state",
  );

  const expired = await issueOAuthState(
    "owner-a", "profile-b", "guest", NOW, options,
  );
  await assert.rejects(
    consumeOAuthState(
      expired,
      new Date("2026-07-30T12:10:00.001Z"),
      options,
    ),
    (error) =>
      error instanceof SafeOuraError &&
      error.code === "invalid_oauth_state",
  );
});

test("issuing OAuth state prunes expired rows without touching live state", async () => {
  const states = new Map([
    ["expired-hash", {
      stateHash: "expired-hash",
      ownerId: "owner-a",
      profileId: "profile-expired",
      flow: "owner",
      expiresAt: "2026-07-30T11:59:59.999Z",
      createdAt: "2026-07-30T11:49:59.999Z",
    }],
    ["future-hash", {
      stateHash: "future-hash",
      ownerId: "owner-a",
      profileId: "profile-future",
      flow: "guest",
      expiresAt: "2026-07-30T12:05:00.000Z",
      createdAt: "2026-07-30T11:55:00.000Z",
    }],
  ]);
  const repository = {
    async deleteExpired(cutoff) {
      for (const [hash, record] of states) {
        if (record.expiresAt <= cutoff) states.delete(hash);
      }
    },
    async createState(record) {
      states.set(record.stateHash, record);
    },
    async takeState(stateHash) {
      const record = states.get(stateHash);
      if (!record) return null;
      states.delete(stateHash);
      return record;
    },
  };

  const rawState = await issueOAuthState(
    "owner-a",
    "profile-new",
    "owner",
    NOW,
    { repository },
  );

  assert.equal(states.has("expired-hash"), false);
  assert.equal(states.has("future-hash"), true);
  assert.deepEqual(
    await consumeOAuthState(rawState, NOW, { repository }),
    { ownerId: "owner-a", profileId: "profile-new", flow: "owner" },
  );
  assert.equal(states.has("future-hash"), true);
});
