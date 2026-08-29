import { access, lstat, readFile, symlink } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { repositoryContext, runGit } from "./lib/git.mjs";
import { validateTopic } from "./lib/worktrees.mjs";

export async function createTaskWorktree(topicValue, cwd = process.cwd()) {
  const topic = validateTopic(topicValue);
  const context = repositoryContext(cwd);
  if (context.branch !== "main" || context.gitDir !== context.gitCommonDir) {
    throw new Error("Create worktrees from the root main integration checkout");
  }
  if (runGit(["status", "--porcelain"], { cwd: context.root }).stdout) {
    throw new Error("The main integration checkout must be clean");
  }
  const ignored = runGit(["check-ignore", "-q", ".worktrees/probe"], {
    cwd: context.root,
    allowFailure: true,
  });
  if (ignored.status !== 0) {
    throw new Error("The .worktrees directory must be ignored");
  }
  const branch = `codex/${topic}`;
  const branchExists = runGit(
    ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    { cwd: context.root, allowFailure: true },
  );
  if (branchExists.status === 0) throw new Error(`Branch ${branch} already exists`);

  const taskPath = resolve(context.root, ".worktrees", topic);
  try {
    await lstat(taskPath);
    throw new Error(`Worktree path .worktrees/${topic} already exists`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  runGit(["worktree", "add", taskPath, "-b", branch, "main"], {
    cwd: context.root,
  });
  await linkDependenciesWhenSafe(context.root, taskPath);
  return { branch, path: taskPath };
}

async function linkDependenciesWhenSafe(root, taskPath) {
  try {
    await access(resolve(root, "node_modules"));
  } catch {
    return;
  }
  const manifests = ["package.json", "package-lock.json"];
  for (const manifest of manifests) {
    const [rootSource, taskSource] = await Promise.all([
      readFile(resolve(root, manifest), "utf8"),
      readFile(resolve(taskPath, manifest), "utf8"),
    ]);
    if (rootSource !== taskSource) return;
  }
  const target = relative(taskPath, resolve(root, "node_modules"));
  await symlink(target, resolve(taskPath, "node_modules"), "dir");
}

async function main() {
  try {
    const created = await createTaskWorktree(process.argv[2]);
    process.stdout.write(`Created ${created.branch} at ${created.path}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Worktree creation failed"}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
