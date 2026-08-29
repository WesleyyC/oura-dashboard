import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("feature client entrypoints contain no server imports", async () => {
  for (const path of [
    "features/profile-management/client.ts",
    "features/health-data/client.ts",
    "features/oura-connection/client.ts",
    "features/dashboard/client.ts",
  ]) {
    const source = await read(path);
    assert.doesNotMatch(source, /platform\/database|platform\/runtime|\/server\//);
  }
});

test("feature server entrypoints do not re-export browser component graphs", async () => {
  for (const path of [
    "features/profile-management/server.ts",
    "features/profile-management/server/profile-repository.ts",
    "features/profile-management/server/profile-service.ts",
    "features/oura-connection/server.ts",
  ]) {
    const source = await read(path);
    assert.doesNotMatch(source, /from ["']\.\/client["']/);
    assert.doesNotMatch(source, /from ["']\.\.\/client["']/);
    assert.doesNotMatch(source, /\.\/components\//);
  }
});

test("health server exports tenant-scoped record operations", async () => {
  const healthServer = await import("../../features/health-data/server.ts");
  assert.equal(typeof healthServer.readHealthRange, "function");
  assert.equal(typeof healthServer.writeHealthRecords, "function");
});
