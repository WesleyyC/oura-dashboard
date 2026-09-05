import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectDependencies } from "../../../scripts/agents/check-dependencies.mjs";

async function fixture(t, packages, installed) {
  const root = await mkdtemp(join(tmpdir(), "dependency-gate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages }));
  for (const [path, version] of Object.entries(installed)) {
    await mkdir(join(root, path), { recursive: true });
    await writeFile(join(root, path, "package.json"), JSON.stringify({ version }));
  }
  return root;
}

function platformPackages(extraDependencies = {}) {
  return {
    "": { dependencies: { engine: "1.0.0", ...extraDependencies } },
    "node_modules/engine": { version: "1.0.0", optionalDependencies: { native: "1.0.0", foreign: "1.0.0" } },
    "node_modules/native": { version: "1.0.0", optional: true, cpu: [process.arch] },
    "node_modules/foreign": { version: "1.0.0", optional: true, cpu: ["!" + process.arch], dependencies: { helper: "1.0.0", nested: "1.0.0" } },
    "node_modules/helper": { version: "1.0.0", optional: true },
    "node_modules/foreign/node_modules/nested": { version: "1.0.0", optional: true },
  };
}
const installedHost = { "node_modules/engine": "1.0.0", "node_modules/native": "1.0.0" };

test("dependency gate excludes hoisted and nested children used only by foreign-platform packages", async (t) => {
  const root = await fixture(t, platformPackages(), installedHost);
  assert.deepEqual(await inspectDependencies(root), { valid: true, checked: 2, mismatches: [] });
});

test("dependency gate still rejects a missing host-native optional package", async (t) => {
  const root = await fixture(t, platformPackages(), { "node_modules/engine": "1.0.0" });
  assert.deepEqual((await inspectDependencies(root)).mismatches, ["node_modules/native"]);
});

test("dependency gate requires shared optional children when a host path reaches them", async (t) => {
  const root = await fixture(t, platformPackages({ helper: "1.0.0" }), installedHost);
  assert.deepEqual((await inspectDependencies(root)).mismatches, ["node_modules/helper"]);
});

test("dependency gate rejects wrong installed versions even on optional host packages", async (t) => {
  const root = await fixture(t, platformPackages(), { ...installedHost, "node_modules/native": "0.9.0" });
  assert.deepEqual((await inspectDependencies(root)).mismatches, ["node_modules/native"]);
});

test("dependency gate verifies an installed optional child even when its platform branch is inactive", async (t) => {
  const root = await fixture(t, platformPackages(), { ...installedHost, "node_modules/helper": "0.9.0" });
  assert.deepEqual((await inspectDependencies(root)).mismatches, ["node_modules/helper"]);
});

test("dependency gate does not confuse a present invalid manifest with an absent optional child", async (t) => {
  const root = await fixture(t, platformPackages(), { ...installedHost, "node_modules/helper": "1.0.0" });
  for (const value of [null, false, 0, {}]) {
    await writeFile(join(root, "node_modules/helper/package.json"), JSON.stringify(value));
    assert.deepEqual((await inspectDependencies(root)).mismatches, ["node_modules/helper"]);
  }
});

test("dependency traversal resolves nested versions, peers and development dependencies without cycling", async (t) => {
  const packages = {
    "": { devDependencies: { engine: "1.0.0" } },
    "node_modules/engine": { version: "1.0.0", dependencies: { helper: "2.0.0" }, peerDependencies: { peer: "1.0.0" } },
    "node_modules/engine/node_modules/helper": { version: "2.0.0", optional: true, dependencies: { engine: "1.0.0" } },
    "node_modules/peer": { version: "1.0.0", optional: true },
  };
  const root = await fixture(t, packages, { "node_modules/engine": "1.0.0", "node_modules/engine/node_modules/helper": "2.0.0" });
  assert.deepEqual((await inspectDependencies(root)).mismatches, ["node_modules/peer"]);
});
