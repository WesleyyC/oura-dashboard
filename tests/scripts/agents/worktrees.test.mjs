import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildOverlapReport,
  classifyPath,
  validateTopic,
} from "../../../scripts/agents/lib/worktrees.mjs";
import {
  parseNameStatusPaths,
  parseStatusPaths,
  statusForRepository,
  formatStatus,
} from "../../../scripts/agents/status.mjs";
import { createGitFixture } from "./git-fixture.mjs";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

function runCli(script, args, cwd) {
  return spawnSync(
    process.execPath,
    [join(repositoryRoot, "scripts/agents", script), ...args],
    { cwd, encoding: "utf8" },
  );
}

test("topic slugs reject unsafe branch and path input", () => {
  for (const value of [
    "../escape",
    "Feature",
    "codex/topic",
    "two words",
    "",
  ]) {
    assert.throws(() => validateTopic(value), /topic/i);
  }
  assert.equal(validateTopic("dashboard-state"), "dashboard-state");
});

test("path classification gives feature overlap a stable area", () => {
  assert.equal(classifyPath("features/dashboard/state.ts"), "dashboard");
  assert.equal(classifyPath("platform/auth/server.ts"), "platform");
  assert.equal(classifyPath("package.json"), "repository");
});

test("overlap reporting returns only exact shared paths", () => {
  const overlaps = buildOverlapReport(
    [
      { branch: "codex/dashboard-ui" },
      { branch: "codex/dashboard-state" },
      { branch: "codex/auth" },
    ],
    new Map([
      ["codex/dashboard-ui", ["features/dashboard/state.ts", "app/page.tsx"]],
      ["codex/dashboard-state", ["features/dashboard/state.ts"]],
      ["codex/auth", ["platform/auth/server.ts"]],
    ]),
  );
  assert.deepEqual(overlaps, [
    {
      branches: ["codex/dashboard-state", "codex/dashboard-ui"],
      files: ["features/dashboard/state.ts"],
    },
  ]);
});

test("status parsers preserve both sides of renames and deleted paths", () => {
  assert.deepEqual(
    parseNameStatusPaths("R100\0features/old.ts\0features/new.ts\0D\0gone.ts\0"),
    ["features/old.ts", "features/new.ts", "gone.ts"],
  );
  assert.deepEqual(
    parseStatusPaths("R  features/new.ts\0features/old.ts\0 D gone.ts\0"),
    ["features/new.ts", "features/old.ts", "gone.ts"],
  );
});

test("create-worktree makes one matching branch and linked path", async (t) => {
  const fixture = await createGitFixture(t);
  const result = runCli("create-worktree.mjs", ["dashboard-state"], fixture.root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /codex\/dashboard-state/);
  assert.match(result.stdout, /\.worktrees\/dashboard-state/);
  assert.match(fixture.runGit("worktree", "list", "--porcelain"), /codex\/dashboard-state/);
});

test("create-worktree rejects dirty main and existing collisions", async (t) => {
  const fixture = await createGitFixture(t);
  await writeFile(join(fixture.root, "dirty.txt"), "dirty\n");
  let result = runCli("create-worktree.mjs", ["dirty-task"], fixture.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /clean/i);

  fixture.runGit("add", "dirty.txt");
  fixture.runGit("commit", "-m", "clean fixture");
  fixture.runGit("branch", "codex/existing-task");
  result = runCli("create-worktree.mjs", ["existing-task"], fixture.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exists/i);
});

test("context rejects main and accepts a matching task worktree", async (t) => {
  const fixture = await createGitFixture(t);
  let result = runCli("check-context.mjs", [], fixture.root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /main|integration/i);

  result = runCli("create-worktree.mjs", ["context-check"], fixture.root);
  assert.equal(result.status, 0, result.stderr);
  const taskPath = join(fixture.root, ".worktrees", "context-check");
  result = runCli("check-context.mjs", [], taskPath);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /codex\/context-check/);
});

test("status reports exact live-branch overlap without ignored content", async (t) => {
  const fixture = await createGitFixture(t);
  for (const topic of ["dashboard-ui", "dashboard-state", "auth-change"]) {
    const result = runCli("create-worktree.mjs", [topic], fixture.root);
    assert.equal(result.status, 0, result.stderr);
  }

  for (const topic of ["dashboard-ui", "dashboard-state"]) {
    const cwd = join(fixture.root, ".worktrees", topic);
    await mkdir(join(cwd, "features/dashboard"), { recursive: true });
    await writeFile(join(cwd, "features/dashboard/state.ts"), `${topic}\n`);
    spawnSync("git", ["add", "features/dashboard/state.ts"], { cwd });
    spawnSync("git", ["commit", "-m", topic], { cwd });
  }
  const authPath = join(fixture.root, ".worktrees", "auth-change");
  await mkdir(join(authPath, "platform/auth"), { recursive: true });
  await writeFile(join(authPath, "platform/auth/server.ts"), "auth\n");
  spawnSync("git", ["add", "platform/auth/server.ts"], { cwd: authPath });
  spawnSync("git", ["commit", "-m", "auth"], { cwd: authPath });
  await mkdir(join(fixture.root, "work"), { recursive: true });
  await writeFile(join(fixture.root, "work/secret.json"), "sensitive-marker\n");

  const report = statusForRepository(fixture.root);
  assert.deepEqual(report.overlaps, [
    {
      branches: ["codex/dashboard-state", "codex/dashboard-ui"],
      files: ["features/dashboard/state.ts"],
    },
  ]);
  assert.equal(
    report.worktrees.find(({ branch }) => branch === "codex/auth-change")
      .areas.platform,
    1,
  );
  assert.doesNotMatch(JSON.stringify(report), /sensitive-marker|secret\.json/);
});

test("status reports overlap between a rename source and an edit", async (t) => {
  const fixture = await createGitFixture(t);
  await fixture.commitFile("features/dashboard/old.ts", "base\n");
  for (const topic of ["rename-state", "edit-state"]) {
    const result = runCli("create-worktree.mjs", [topic], fixture.root);
    assert.equal(result.status, 0, result.stderr);
  }

  const renamePath = join(fixture.root, ".worktrees", "rename-state");
  let result = spawnSync(
    "git",
    ["mv", "features/dashboard/old.ts", "features/dashboard/new.ts"],
    { cwd: renamePath, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  result = spawnSync("git", ["commit", "-m", "rename state"], {
    cwd: renamePath,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);

  const editPath = join(fixture.root, ".worktrees", "edit-state");
  await writeFile(join(editPath, "features/dashboard/old.ts"), "edited\n");
  result = spawnSync("git", ["add", "features/dashboard/old.ts"], {
    cwd: editPath,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  result = spawnSync("git", ["commit", "-m", "edit state"], {
    cwd: editPath,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);

  assert.deepEqual(statusForRepository(fixture.root).overlaps, [
    {
      branches: ["codex/edit-state", "codex/rename-state"],
      files: ["features/dashboard/old.ts"],
    },
  ]);
});

test("status marks an unreadable branch as incomplete without repairing another worktree", async (t) => {
  const fixture = await createGitFixture(t);
  fixture.runGit("worktree", "add", ".worktrees/unborn", "-b", "codex/unborn");
  fixture.runGit("update-ref", "-d", "refs/heads/codex/unborn");
  const report = statusForRepository(fixture.root);
  const item = report.worktrees.find(({ branch }) => branch === "codex/unborn");
  assert.equal(report.complete, false);
  assert.equal(item.inspection, "incomplete");
  assert.match(formatStatus(report), /incomplete|unknown/i);
  const cli = runCli("status.mjs", [], fixture.root);
  assert.notEqual(cli.status, 0);
  assert.equal(fixture.runGit("worktree", "list", "--porcelain").includes("codex/unborn"), true);
});

for (const [label, installedVersion, shouldLink] of [
  ["matching", "1.2.3", true],
  ["stale", "1.2.2", false],
  ["missing", null, false],
]) {
  test(`worktree dependency reuse requires ${label} installed packages to match the lock`, async (t) => {
    const fixture = await createGitFixture(t);
    await fixture.commitFile("package.json", JSON.stringify({ name: "fixture", private: true, dependencies: { sample: "1.2.3" } }));
    await fixture.commitFile("package-lock.json", JSON.stringify({ lockfileVersion: 3, packages: {
      "": { name: "fixture", dependencies: { sample: "1.2.3" } },
      "node_modules/sample": { version: "1.2.3" },
    } }));
    await mkdir(join(fixture.root, "node_modules/sample"), { recursive: true });
    if (installedVersion) await writeFile(join(fixture.root, "node_modules/sample/package.json"), JSON.stringify({ name: "sample", version: installedVersion }));
    const result = runCli("create-worktree.mjs", ["dependency-check"], fixture.root);
    assert.equal(result.status, 0, result.stderr);
    const installed = await lstat(join(fixture.root, ".worktrees/dependency-check/node_modules")).then((entry) => entry.isSymbolicLink(), () => false);
    assert.equal(installed, shouldLink);
  });
}
