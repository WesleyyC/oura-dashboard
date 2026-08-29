import { readlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { repositoryContext } from "./lib/git.mjs";

export async function checkContext({ cwd = process.cwd(), release = false } = {}) {
  const context = repositoryContext(cwd);
  if (release) {
    if (context.branch !== "main" || context.gitDir !== context.gitCommonDir) {
      throw new Error("Release verification must run from the root main checkout");
    }
    const owner = await readlink(resolve(context.gitCommonDir, "codex-release.lock", "owner"));
    if (!resolve(owner).startsWith(resolve(context.root, ".worktrees") + "/")) {
      throw new Error("Release lock owner is not a repository task worktree");
    }
    return context;
  }

  if (context.branch === "main") {
    throw new Error("The main checkout is integration-only; use a task worktree");
  }
  const match = /^codex\/(.+)$/.exec(context.branch);
  if (!match) throw new Error("Task branch must use the codex/<topic> prefix");
  const topic = match[1];
  if (
    basename(context.root) !== topic ||
    basename(dirname(context.root)) !== ".worktrees" ||
    context.gitDir === context.gitCommonDir
  ) {
    throw new Error("Task branch and .worktrees/<topic> path do not match");
  }
  return context;
}

async function main() {
  try {
    const context = await checkContext({ release: process.argv.includes("--release") });
    process.stdout.write(`Valid agent context: ${context.branch} at ${context.root}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Agent context is invalid"}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
