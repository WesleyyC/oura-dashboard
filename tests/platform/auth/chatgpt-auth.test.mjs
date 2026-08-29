import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthenticationError,
  parseChatGPTUser,
  requestUserErrorResponse,
  requireRequestUser,
} from "../../../platform/auth/request-user.ts";
import { OwnerAccessError } from "../../../platform/auth/owner-allowlist.ts";

test("trusted Sites headers produce a stable server identity", () => {
  const user = parseChatGPTUser(new Headers({
    "oai-authenticated-user-id": "user-123",
    "oai-authenticated-user-email": "owner@example.com",
    "oai-authenticated-user-full-name": "Alex%20Morgan",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  }));

  assert.deepEqual(user, {
    userId: "user-123",
    email: "owner@example.com",
    fullName: "Alex Morgan",
    displayName: "Alex Morgan",
  });
});

test("identity requires both stable ID and email", () => {
  assert.equal(parseChatGPTUser(new Headers()), null);
  assert.equal(
    parseChatGPTUser(new Headers({
      "oai-authenticated-user-id": "user-123",
    })),
    null,
  );
  assert.equal(
    parseChatGPTUser(new Headers({
      "oai-authenticated-user-email": "owner@example.com",
    })),
    null,
  );
});

test("optional full name is decoded only for the declared encoding", () => {
  const baseHeaders = {
    "oai-authenticated-user-id": "user-123",
    "oai-authenticated-user-email": "owner@example.com",
  };

  assert.deepEqual(
    parseChatGPTUser(new Headers({
      ...baseHeaders,
      "oai-authenticated-user-full-name": "Alex%20Morgan",
    })),
    {
      userId: "user-123",
      email: "owner@example.com",
      fullName: null,
      displayName: "owner@example.com",
    },
  );

  assert.deepEqual(
    parseChatGPTUser(new Headers({
      ...baseHeaders,
      "oai-authenticated-user-full-name": "%E0%A4%A",
      "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
    })),
    {
      userId: "user-123",
      email: "owner@example.com",
      fullName: null,
      displayName: "owner@example.com",
    },
  );
});

test("API identity rejects signed-out requests", () => {
  assert.throws(
    () => requireRequestUser(new Request("https://health.example/api/health")),
    (error) => error instanceof AuthenticationError && error.status === 401,
  );
});

test("API identity returns an authenticated allowlisted owner", () => {
  const request = new Request("https://health.example/api/health", {
    headers: {
      "oai-authenticated-user-id": "user-123",
      "oai-authenticated-user-email": "OWNER@EXAMPLE.COM",
    },
  });

  assert.equal(
    requireRequestUser(request, "owner@example.com").userId,
    "user-123",
  );
});

test("API identity rejects an authenticated owner outside the allowlist", () => {
  const request = new Request("https://health.example/api/health", {
    headers: {
      "oai-authenticated-user-id": "user-123",
      "oai-authenticated-user-email": "other@example.org",
    },
  });

  assert.throws(
    () => requireRequestUser(request, "owner@example.com"),
    (error) =>
      error instanceof OwnerAccessError &&
      error.status === 403 &&
      error.code === "owner_not_allowed",
  );
});

test("API identity fails closed when the owner allowlist is unavailable", () => {
  const request = new Request("https://health.example/api/health", {
    headers: {
      "oai-authenticated-user-id": "user-123",
      "oai-authenticated-user-email": "owner@example.com",
    },
  });

  assert.throws(
    () => requireRequestUser(request, ""),
    (error) =>
      error instanceof OwnerAccessError &&
      error.status === 503 &&
      error.code === "owner_allowlist_unavailable",
  );
});

test("request-user failures produce private stable response codes", async () => {
  const cases = [
    [new AuthenticationError(), 401, "authentication_required"],
    [new OwnerAccessError("owner_not_allowed", 403), 403, "owner_not_allowed"],
    [
      new OwnerAccessError("owner_allowlist_unavailable", 503),
      503,
      "owner_allowlist_unavailable",
    ],
  ];

  for (const [error, expectedStatus, expectedCode] of cases) {
    const response = requestUserErrorResponse(error);
    assert.ok(response);
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { error: expectedCode });
  }

  assert.equal(requestUserErrorResponse(new Error("unexpected")), null);
});
