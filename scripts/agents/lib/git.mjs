import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

export function runGit(
  args,
  { cwd = process.cwd(), allowFailure = false, trimOutput = true } = {},
) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) {
    throw new Error(`Git could not start: ${result.error.message}`);
  }
  const output = {
    status: result.status ?? 1,
    stdout: trimOutput ? result.stdout.trim() : result.stdout,
    stderr: trimOutput ? result.stderr.trim() : result.stderr,
  };
  if (!allowFailure && output.status !== 0) {
    throw new Error(`Git command failed (${args[0] ?? "unknown"})`);
  }
  return output;
}

export function repositoryContext(cwd = process.cwd()) {
  const root = runGit(["rev-parse", "--show-toplevel"], { cwd }).stdout;
  const gitDirText = runGit(["rev-parse", "--git-dir"], { cwd }).stdout;
  const commonText = runGit(["rev-parse", "--git-common-dir"], {
    cwd,
  }).stdout;
  return {
    root,
    gitDir: absoluteGitPath(gitDirText, root),
    gitCommonDir: absoluteGitPath(commonText, root),
    branch: runGit(["branch", "--show-current"], { cwd }).stdout,
  };
}

function absoluteGitPath(value, root) {
  return isAbsolute(value) ? resolve(value) : resolve(root, value);
}
