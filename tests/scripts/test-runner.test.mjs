import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  discoverTests,
  selectTests,
} from "../../scripts/run-tests.mjs";

const testsRoot = path.resolve(import.meta.dirname, "..");

test("discoverTests recursively returns sorted test modules only", async () => {
  const fixture = await mkdtemp(path.join(testsRoot, ".runner-fixture-"));
  try {
    await mkdir(path.join(fixture, "nested"));
    await Promise.all([
      writeFile(path.join(fixture, "z.test.mjs"), ""),
      writeFile(path.join(fixture, "nested/a.test.mjs"), ""),
      writeFile(path.join(fixture, "nested/ignore.mjs"), ""),
    ]);
    assert.deepEqual(await discoverTests(fixture), [
      path.join(fixture, "nested/a.test.mjs"),
      path.join(fixture, "z.test.mjs"),
    ]);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("selectTests filters known ownership areas and rejects unsafe input", () => {
  const files = [
    "/repo/tests/features/dashboard/view.test.mjs",
    "/repo/tests/features/profile-management/settings.test.mjs",
    "/repo/tests/features/health-data/range.test.mjs",
    "/repo/tests/features/oura-connection/oauth.test.mjs",
  ];
  assert.deepEqual(selectTests(files), files);
  for (const area of [
    "dashboard",
    "profile-management",
    "health-data",
    "oura-connection",
  ]) {
    assert.equal(selectTests(files, area).length, 1);
  }
  assert.throws(() => selectTests(files, "unknown"), /Unknown test area/);
  assert.throws(() => selectTests(files, "../dashboard"), /Invalid test area/);
});

test("discoverTests rejects traversal outside the repository test tree", async () => {
  await assert.rejects(discoverTests(path.resolve(testsRoot, "..")), /inside tests/);
});
