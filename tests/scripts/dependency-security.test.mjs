import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("the release lockfile excludes esbuild versions affected by GHSA-67mh-4wv8-2f99", async () => {
  const lock = JSON.parse(await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"));
  const builds = Object.entries(lock.packages).filter(([name]) => name.endsWith("node_modules/esbuild"));
  assert.ok(builds.length > 0, "must inspect the actual locked build tools");
  for (const [name, entry] of builds) {
    const [major, minor] = entry.version.split(".").map(Number);
    assert.ok(major > 0 || minor >= 25, `${name}@${entry.version} permits arbitrary-origin dev-server reads`);
  }
});

test("the React server decoder and ZIP tooling exclude their known vulnerable patch releases", async () => {
  const { packages } = JSON.parse(await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"));
  for (const [name, entry] of Object.entries(packages)) {
    const [major, minor, patch] = (entry.version ?? "0.0.0").split(".").map(Number);
    if (name.endsWith("node_modules/react-server-dom-webpack") && major === 19 && minor === 2) {
      assert.ok(patch >= 8, `${name}@${entry.version} is affected by GHSA-wx67-qw84-cm4g`);
    }
    if (name.endsWith("node_modules/fflate") && major === 0 && minor === 7) {
      assert.ok(patch >= 5, `${name}@${entry.version} is affected by GHSA-px8p-9vwx-vf98`);
    }
  }
});

test("the patched Drizzle tool still generates an executable owner-scoped schema", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const directory = await mkdtemp(path.join(tmpdir(), "oura-schema-tooling-"));
  try {
    const generated = spawnSync(process.execPath, [
      path.join(root, "node_modules/drizzle-kit/bin.cjs"), "generate",
      "--dialect", "sqlite", "--schema", "./platform/database/schema.ts", "--out", directory,
    ], { cwd: root, encoding: "utf8", timeout: 20_000 });
    assert.equal(generated.status, 0, generated.stderr || generated.error?.message);
    const files = (await readdir(directory)).filter((name) => name.endsWith(".sql"));
    assert.equal(files.length, 1);
    const database = new DatabaseSync(":memory:");
    try {
      database.exec(await readFile(path.join(directory, files[0]), "utf8"));
      assert.ok(database.prepare("PRAGMA table_info(health_profiles)").all().some(({ name }) => name === "owner_id"));
      assert.ok(database.prepare("PRAGMA foreign_key_list(oura_credentials)").all().some(({ table }) => table === "health_profiles"));
    } finally { database.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
