import assert from "node:assert/strict";
import test from "node:test";

function rateLimitDatabase() {
  return {
    prepare() {
      return {
        bind() {
          return {
            async run() {
              return { success: true, results: [], meta: { changes: 1 } };
            },
            async all() {
              return {
                success: true,
                results: [{ request_count: 1, requestCount: 1 }],
                meta: { changes: 1 },
              };
            },
            async raw() {
              return [[1]];
            },
          };
        },
      };
    },
  };
}

async function builtWorker() {
  const workerUrl = new URL("../../../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function environment(overrides = {}) {
  return {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    DB: rateLimitDatabase(),
    AUTH_PROVIDER: "chatgpt-sites",
    OWNER_EMAIL_ALLOWLIST: "owner@example.com",
    SECURITY_RATE_LIMIT_KEY: "REPLACE_WITH_RATE_LIMIT_KEY_000000000000000",
    ...overrides,
  };
}

const ctx = { waitUntil() {}, passThroughOnException() {} };

test("every owner API rejects an authenticated unapproved identity before input", async () => {
  const worker = await builtWorker();
  const routes = [
    ["GET", "/api/account"],
    ["GET", "/api/health"],
    ["GET", "/api/profiles"],
    ["POST", "/api/oura/authorize"],
    ["POST", "/api/oura/refresh"],
    ["POST", "/api/oura/invites"],
  ];

  for (const [method, path] of routes) {
    const response = await worker.fetch(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          "oai-authenticated-user-id": "other-user",
          "oai-authenticated-user-email": "other@example.org",
        },
      }),
      environment(),
      ctx,
    );

    assert.equal(response.status, 403, `${method} ${path}`);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { error: "owner_not_allowed" });
  }
});

test("owner APIs fail closed when the hosted allowlist is missing", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/account", {
      headers: {
        "oai-authenticated-user-id": "owner-user",
        "oai-authenticated-user-email": "owner@example.com",
      },
    }),
    environment({ OWNER_EMAIL_ALLOWLIST: undefined }),
    ctx,
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    error: "owner_allowlist_unavailable",
  });
});
