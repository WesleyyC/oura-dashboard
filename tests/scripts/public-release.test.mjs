import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isPublicReleasePath,
  selectPublicReleaseFiles,
} from "../../scripts/public-release-policy.mjs";
import { auditPublicFiles } from "../../scripts/audit-public-release.mjs";
import { exportPublicFiles } from "../../scripts/create-public-release.mjs";

const repositoryRoot = new URL("../../", import.meta.url);

test("public release documents both supported hosting paths and operator duties", async () => {
  const requiredFiles = [
    "LICENSE",
    "SECURITY.md",
    "PRIVACY.md",
    "CONTRIBUTING.md",
    "docs/configuration.md",
    "docs/deploy-chatgpt-sites.md",
    "docs/deploy-cloudflare.md",
  ];
  const entries = await Promise.all(
    requiredFiles.map(async (file) => [
      file,
      await readFile(new URL(file, repositoryRoot), "utf8"),
    ]),
  );
  const documents = new Map(entries);
  const readme = await readFile(new URL("README.md", repositoryRoot), "utf8");
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", repositoryRoot), "utf8"),
  );

  assert.match(readme, /ChatGPT Sites/);
  assert.match(readme, /Cloudflare Workers/);
  assert.match(readme, /api\/oura\/callback/);
  assert.match(readme, /api\/oura\/guest\/callback/);
  assert.match(readme, /Privacy/i);
  assert.match(documents.get("LICENSE"), /MIT License/);
  assert.match(documents.get("PRIVACY.md"), /health data/i);
  assert.match(documents.get("SECURITY.md"), /privately report/i);
  assert.match(documents.get("CONTRIBUTING.md"), /synthetic/i);
  assert.match(documents.get("docs/configuration.md"), /AUTH_PROVIDER/);
  assert.match(documents.get("docs/deploy-chatgpt-sites.md"), /chatgpt-sites/);
  assert.match(documents.get("docs/deploy-cloudflare.md"), /cloudflare-access/);
  assert.match(documents.get("docs/deploy-cloudflare.md"), /\/assets\/\*/);
  assert.match(documents.get("docs/deploy-cloudflare.md"), /\/brand\/\*/);
  assert.equal(packageJson.license, "MIT");
  assert.equal(packageJson.private, true);
  assert.equal(
    packageJson.repository?.url,
    "https://github.com/WesleyyC/oura-dashboard.git",
  );
});

test("public CI is read-only, audits the release, and never deploys", async () => {
  const [workflow, dependabot] = await Promise.all([
    readFile(new URL(".github/workflows/ci.yml", repositoryRoot), "utf8"),
    readFile(new URL(".github/dependabot.yml", repositoryRoot), "utf8"),
  ]);

  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(
    workflow,
    /uses: actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\s+# v7/,
  );
  assert.match(
    workflow,
    /uses: actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020\s+# v7/,
  );
  assert.doesNotMatch(workflow, /uses: actions\/(?:checkout|setup-node)@v\d+/);
  assert.match(workflow, /node-version: 22\.13\.0/);
  for (const command of [
    "npm ci",
    "npm run audit:public",
    "npm test",
    "npm run typecheck",
    "npm run lint",
  ]) {
    assert.match(workflow, new RegExp(`run: ${command.replaceAll(" ", "\\s+")}`));
  }
  assert.doesNotMatch(workflow, /deploy|secrets\.|permissions:\s*write/i);
  assert.match(dependabot, /package-ecosystem: "npm"/);
  assert.match(dependabot, /package-ecosystem: "github-actions"/);
  assert.match(dependabot, /interval: "weekly"/);
});

test("public audit covers sensitive assignments, private paths, and symlink targets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oura-public-sensitive-"));
  await mkdir(path.join(root, "src"));
  await mkdir(path.join(root, "work"));
  await writeFile(
    path.join(root, "src", "config.ts"),
    [
      ["OURA_", "CLIENT_SECRET=fictional-nonempty-value"].join(""),
      ["const env = { OURA_", "CLIENT_SECRET: 1234567890 };"].join(""),
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "src", "config.yml"),
    [
      ["CLOUDFLARE_", "ACCESS_AUD: fictional-audience"].join(""),
      ["OURA_", "CLIENT_SECRET: ACTUALSECRETVALUE"].join(""),
    ].join("\n"),
  );
  await writeFile(path.join(root, "work", "private-marker.log"), "safe text\n");
  await symlink("private-marker-target", path.join(root, "src", "link"));

  const issues = await auditPublicFiles({
    root,
    files: [
      "src/config.ts",
      "src/config.yml",
      "work/private-marker.log",
      "src/link",
    ],
    denylistEntries: ["private-marker"],
  });
  assert.deepEqual(
    [...new Set(issues.map(({ category }) => category))].sort(),
    ["private-artifact", "private-denylist", "sensitive-assignment"],
  );
  assert.doesNotMatch(
    JSON.stringify(issues),
    /fictional-nonempty|fictional-audience|ACTUALSECRETVALUE|private-marker/,
  );
});

test("public release selection excludes private history and operator state", () => {
  const files = [
    "README.md",
    "worker/index.ts",
    ".openai/hosting.json",
    ".openai/hosting.example.json",
    "docs/superpowers/specs/private.md",
    "docs/health-refresh.md",
    "scripts/collect-health-snapshot.mjs",
    "scripts/validate-health-snapshot.mjs",
    "tests/features/oura-connection/collect-health-snapshot.test.mjs",
    "tests/features/health-data/health-snapshot.test.mjs",
    "docs/deploy-cloudflare.md",
  ];

  assert.deepEqual(selectPublicReleaseFiles(files), [
    ".openai/hosting.example.json",
    "README.md",
    "docs/deploy-cloudflare.md",
    "worker/index.ts",
  ]);
  assert.equal(isPublicReleasePath("../outside"), false);
  assert.equal(isPublicReleasePath("/absolute"), false);
  assert.equal(isPublicReleasePath("worker\\index.ts"), false);
});

test("public audit reports unsafe categories without reflecting private values", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oura-public-audit-"));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "src", "unsafe.ts"),
    [
      `const local = '${"/" + "Users/private-person/project"}';`,
      `const contact = '${"person" + "@private-domain.zz"}';`,
      `const token = '${"oura_personal_access_" + "token_abcdefghijklmnopqrstuvwxyz"}';`,
      `const project = '${"appgprj_" + "1234567890abcdef"}';`,
      `const marker = '${"private-denylist-" + "value"}';`,
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "src", "safe.ts"),
    [
      "const contact = 'maintainer@example.com';",
      "const placeholder = '00000000-0000-4000-8000-000000000000';",
      "const empty = 'OURA_CLIENT_SECRET=';",
      "const repository = 'https://github.com/WesleyyC/oura-dashboard';",
    ].join("\n"),
  );

  const issues = await auditPublicFiles({
    root,
    files: ["src/unsafe.ts", "src/safe.ts"],
    denylistEntries: ["private-denylist-" + "value"],
  });

  assert.deepEqual(
    [...new Set(issues.map(({ category }) => category))].sort(),
    [
      "absolute-local-path",
      "credential-pattern",
      "non-example-email",
      "private-denylist",
      "production-resource-id",
    ],
  );
  assert.ok(issues.every(({ path: issuePath }) => issuePath === "src/unsafe.ts"));
  assert.doesNotMatch(JSON.stringify(issues), /private-person|private-denylist-|person@/);
});

test("public audit rejects operator config and private paths before reading", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oura-public-path-audit-"));
  const issues = await auditPublicFiles({
    root,
    files: [
      ".openai/hosting.json",
      "wrangler.jsonc",
      ".env.local",
      "docs/superpowers/plans/private.md",
    ],
  });

  assert.deepEqual(issues, [
    { path: ".env.local", category: "operator-config" },
    { path: ".openai/hosting.json", category: "operator-config" },
    { path: "docs/superpowers/plans/private.md", category: "private-history" },
    { path: "wrangler.jsonc", category: "operator-config" },
  ]);
});

test("public exporter copies exact selected files, modes, and safe symlinks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oura-public-source-"));
  const output = path.join(await mkdtemp(path.join(tmpdir(), "oura-public-parent-")), "export");
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "safe release\n");
  await writeFile(path.join(root, "scripts", "run.mjs"), "#!/usr/bin/env node\n");
  await chmod(path.join(root, "scripts", "run.mjs"), 0o755);
  await symlink("README.md", path.join(root, "GUIDE.md"));

  const result = await exportPublicFiles({
    root,
    output,
    files: ["README.md", "scripts/run.mjs", "GUIDE.md"],
  });

  assert.deepEqual(result, { filesCopied: 3 });
  assert.equal(await readFile(path.join(output, "README.md"), "utf8"), "safe release\n");
  assert.equal((await lstat(path.join(output, "scripts", "run.mjs"))).mode & 0o111, 0o111);
  assert.equal((await lstat(path.join(output, "GUIDE.md"))).isSymbolicLink(), true);
  assert.equal(await readlink(path.join(output, "GUIDE.md")), "README.md");
});

test("public exporter refuses nonempty targets and escaping symlinks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oura-public-refuse-source-"));
  const output = await mkdtemp(path.join(tmpdir(), "oura-public-nonempty-"));
  await writeFile(path.join(output, "keep.txt"), "keep\n");
  await writeFile(path.join(root, "README.md"), "safe\n");

  await assert.rejects(
    exportPublicFiles({ root, output, files: ["README.md"] }),
    /empty|exist/i,
  );
  assert.equal(await readFile(path.join(output, "keep.txt"), "utf8"), "keep\n");

  const cleanOutput = path.join(await mkdtemp(path.join(tmpdir(), "oura-public-clean-")), "export");
  await symlink("../outside", path.join(root, "escape"));
  await assert.rejects(
    exportPublicFiles({ root, output: cleanOutput, files: ["escape"] }),
    /symlink|outside/i,
  );
});
