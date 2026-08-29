import assert from "node:assert/strict";
import test from "node:test";

import { secureResponse } from "../../../platform/security/headers.ts";

test("security wrapper preserves responses and applies the global policy", async () => {
  const original = new Response("payload", {
    status: 202,
    headers: { "Cache-Control": "private, no-store" },
  });
  const response = secureResponse(
    original,
    new URL("https://health.example/api/health"),
  );

  assert.equal(response.status, 202);
  assert.equal(await response.text(), "payload");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000",
  );
  assert.equal(
    response.headers.get("permissions-policy"),
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  assert.equal(
    response.headers.get("content-security-policy"),
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  );
});

test("guest connection pages remain no-store and unindexable", async () => {
  const response = secureResponse(
    new Response("guest"),
    new URL("https://health.example/connect/oura/complete"),
  );

  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("access-denied pages remain no-store and unindexable", () => {
  const response = secureResponse(
    new Response("denied"),
    new URL("https://health.example/access-denied"),
  );

  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});
