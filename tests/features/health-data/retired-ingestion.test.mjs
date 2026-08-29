import assert from "node:assert/strict";
import test from "node:test";

test("the built worker has no shared-secret health ingestion route", async () => {
  const workerUrl = new URL("../../../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-retired-sync`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/health/sync", {
      method: "PUT",
      headers: {
        authorization: "Bearer obsolete-secret",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      HEALTH_INGEST_SECRET: "obsolete-secret",
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 404);
  assert.ok(response.status < 200 || response.status >= 300);
  assert.doesNotMatch(
    await response.text(),
    /"(?:profile|upserted|updatedAt)"\s*:/,
  );
});
