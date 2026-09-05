import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  cloudflarePluginConfigFor,
  loadHostingConfig,
  localBindingConfigFor,
} from "../../build/hosting-config.ts";
import { auditPublicFiles, listTrackedFiles } from "../../scripts/audit-public-release.mjs";
import { createGitFixture } from "../scripts/agents/git-fixture.mjs";

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");

test("operator deployment files are ignored and absent from the tracked release", async () => {
  const tracked = new Set(await listTrackedFiles(repositoryRoot));
  for (const file of [".openai/hosting.json", "wrangler.jsonc"]) {
    const ignored = await execFile("git", ["check-ignore", "--no-index", "-q", file], {
      cwd: repositoryRoot,
    }).then(() => true, () => false);
    assert.equal(ignored, true, file);
    assert.equal(tracked.has(file), false, `${file} must not be tracked`);
  }
});

test("local operator files can exist, but force-tracking them fails the public boundary", async (t) => {
  const fixture = await createGitFixture(t);
  await fixture.commitFile(".gitignore", ".openai/hosting.json\nwrangler.jsonc\n");
  await mkdir(path.join(fixture.root, ".openai"));
  await writeFile(path.join(fixture.root, ".openai/hosting.json"), "{}\n");
  await writeFile(path.join(fixture.root, "wrangler.jsonc"), "{}\n");
  const files = await listTrackedFiles(fixture.root);
  assert.equal(files.includes(".openai/hosting.json"), false);
  assert.equal(files.includes("wrangler.jsonc"), false);
  assert.deepEqual(await auditPublicFiles({ root: fixture.root, files }), []);
  fixture.runGit("add", "-f", ".openai/hosting.json", "wrangler.jsonc");
  const issues = await auditPublicFiles({ root: fixture.root, files: await listTrackedFiles(fixture.root) });
  assert.deepEqual(issues, [
    { path: ".openai/hosting.json", category: "operator-config" },
    { path: "wrangler.jsonc", category: "operator-config" },
  ]);
});

test("tracked hosting examples are fictional and structurally complete", async () => {
  const [sitesSource, wranglerSource] = await Promise.all([
    readFile(path.join(repositoryRoot, ".openai/hosting.example.json"), "utf8"),
    readFile(path.join(repositoryRoot, "wrangler.example.jsonc"), "utf8"),
  ]);
  const sites = JSON.parse(sitesSource);
  const wrangler = JSON.parse(wranglerSource);

  assert.deepEqual(sites, {
    project_id: "REPLACE_WITH_SITES_PROJECT_ID",
    d1: "DB",
    r2: null,
  });
  assert.equal(wrangler.main, "worker/index.ts");
  assert.equal(wrangler.account_id, "REPLACE_WITH_CLOUDFLARE_ACCOUNT_ID");
  assert.equal(wrangler.compatibility_date, "2026-08-29");
  assert.deepEqual(wrangler.compatibility_flags, ["nodejs_compat"]);
  assert.equal(wrangler.workers_dev, false);
  assert.deepEqual(wrangler.routes, [
    { pattern: "dashboard.example.com", custom_domain: true },
  ]);
  assert.equal(wrangler.d1_databases[0].binding, "DB");
  assert.equal(wrangler.d1_databases[0].migrations_dir, "drizzle");
  assert.equal(
    wrangler.d1_databases[0].database_id,
    "REPLACE_WITH_D1_DATABASE_ID",
  );
  assert.equal(wrangler.vars.AUTH_PROVIDER, "cloudflare-access");
  assert.match(wrangler.vars.CLOUDFLARE_ACCESS_TEAM_DOMAIN, /\.cloudflareaccess\.com$/);
  assert.equal(
    wrangler.vars.CLOUDFLARE_ACCESS_AUD,
    "REPLACE_WITH_ACCESS_APPLICATION_AUD",
  );
  assert.doesNotMatch(`${sitesSource}\n${wranglerSource}`, /appgprj_[A-Za-z0-9]{12,}/);
});

test("missing Sites config uses a safe local DB placeholder", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oura-hosting-missing-"));
  const config = await loadHostingConfig(root);
  assert.deepEqual(config, { d1: "DB", r2: null });
  assert.deepEqual(localBindingConfigFor(config).d1_databases, [
    {
      binding: "DB",
      database_name: "local-oura-dashboard",
      database_id: "00000000-0000-4000-8000-000000000000",
    },
  ]);
});

test("an operator Wrangler file owns production bindings without local overrides", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oura-hosting-wrangler-"));
  await writeFile(path.join(root, "wrangler.jsonc"), "{}\n");
  assert.equal(await cloudflarePluginConfigFor(root), undefined);
});

test("present Sites config selects declared bindings without exposing its project id", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oura-hosting-present-"));
  await mkdir(path.join(root, ".openai"));
  await writeFile(path.join(root, ".openai", "hosting.json"), JSON.stringify({
    project_id: "private-project-value",
    d1: "DATABASE",
    r2: "FILES",
  }));

  const config = await loadHostingConfig(root);
  assert.deepEqual(config, { d1: "DATABASE", r2: "FILES" });
  const bindings = localBindingConfigFor(config);
  assert.equal(bindings.d1_databases[0].binding, "DATABASE");
  assert.equal(bindings.r2_buckets[0].binding, "FILES");
  assert.doesNotMatch(JSON.stringify(bindings), /private-project-value/);
});

test("malformed present Sites config fails with a value-free error", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oura-hosting-invalid-"));
  await mkdir(path.join(root, ".openai"));
  await writeFile(
    path.join(root, ".openai", "hosting.json"),
    JSON.stringify({ project_id: "private-project-value", d1: 42 }),
  );

  await assert.rejects(
    loadHostingConfig(root),
    (error) => {
      assert.match(error.message, /hosting configuration is invalid/i);
      assert.doesNotMatch(error.message, /private-project-value|42/);
      return true;
    },
  );
});
