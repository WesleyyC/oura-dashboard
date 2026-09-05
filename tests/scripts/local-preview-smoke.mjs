// Run against `npm start -- --port 5176` in a synthetic, credential-free checkout.
import assert from "node:assert/strict";

const origin = new URL(process.argv[2] ?? "http://127.0.0.1:5176");
assert.equal(origin.protocol, "http:", "This check is local-only");
assert.equal(origin.hostname, "127.0.0.1", "This check refuses deployed hosts");
assert.ok(!origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash);

for (const route of ["/", "/settings"]) {
  const response = await fetch(new URL(route, origin), { redirect: "manual", signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 307, `${route} must redirect an anonymous visitor, not return a server error`);
  assert.ok(response.headers.get("location"));
  await response.body?.cancel();
}
for (const route of ["/api/account", "/api/health", "/api/profiles", "/api/oura/diagnostics"]) {
  const response = await fetch(new URL(route, origin), {
    redirect: "manual", signal: AbortSignal.timeout(10_000),
    headers: {
      "oai-authenticated-user-id": "synthetic-preview-owner",
      "oai-authenticated-user-email": "synthetic@example.com",
      "Cf-Access-Authenticated-User-Email": "synthetic@example.com",
    },
  });
  assert.equal(response.status, 401, `${route} must reject an unsigned identity`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  await response.body?.cancel();
}
const guest = await fetch(new URL("/connect/oura", origin), { redirect: "manual", signal: AbortSignal.timeout(10_000) });
assert.equal(guest.status, 200, "Guest landing page must render under the Worker runtime");
assert.match(guest.headers.get("cache-control") ?? "", /no-store/);
await guest.body?.cancel();
console.log("Local Worker preview: anonymous pages redirect, unsigned owner APIs are denied, guest page renders.");
