import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const sharedUiRoot = path.join(repositoryRoot, "shared/ui");

test("shared UI exports browser-safe primitives only", async () => {
  const entrypoint = await readFile(path.join(sharedUiRoot, "index.ts"), "utf8");
  assert.match(entrypoint, /BrandMark/);
  assert.match(entrypoint, /DashboardSelector/);

  const entries = await readdir(sharedUiRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) continue;
    const source = await readFile(path.join(sharedUiRoot, entry.name), "utf8");
    assert.doesNotMatch(source, /@\/features|@\/platform|server\.ts/);
  }
});
