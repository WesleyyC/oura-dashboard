import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Oura server entrypoint preserves the service surface", async () => {
  const oura = await import("../../features/oura-connection/server.ts");
  for (const name of [
    "fetchOuraResource",
    "mergeOuraAggregates",
    "collectOuraAggregates",
    "encryptTokenSet",
    "decryptTokenSet",
    "issueOAuthState",
    "consumeOAuthState",
    "issueConnectionInvite",
    "consumeConnectionInvite",
    "refreshProfile",
  ]) {
    assert.equal(typeof oura[name], "function", name);
  }
});

test("refresh orchestration is independent of D1 state persistence", async () => {
  const refreshServiceSource = await readFile(
    new URL(
      "../../features/oura-connection/server/refresh-service.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const refreshStateRepositorySource = await readFile(
    new URL(
      "../../features/oura-connection/server/refresh-state-repository.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(refreshServiceSource, /drizzle-orm|healthSyncStateProfile/);
  assert.match(refreshStateRepositorySource, /healthSyncStateProfile/);
});

test("Oura client contracts cannot expose secrets or server modules", async () => {
  const source = await readFile(
    new URL("../../features/oura-connection/client.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /token|encrypt|OAuthState|platform\/database|platform\/runtime|\/server\//i,
  );
});
