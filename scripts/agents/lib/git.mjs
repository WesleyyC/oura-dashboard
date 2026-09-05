import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

export function runGit(
  args,
  { cwd = process.cwd(), allowFailure = false, trimOutput = true, timeout } = {},
) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout, killSignal: "SIGKILL" });
  if (result.error && !allowFailure) {
    throw new Error(`Git command could not complete (${args[0] ?? "unknown"})`);
  }
  const output = {
    status: result.status ?? 1,
    stdout: trimOutput ? (result.stdout ?? "").trim() : result.stdout ?? "",
    stderr: trimOutput ? (result.stderr ?? "").trim() : result.stderr ?? "",
  };
  if (!allowFailure && output.status !== 0) {
    throw new Error(`Git command failed (${args[0] ?? "unknown"})`);
  }
  return output;
}

export function repositoryContext(cwd = process.cwd(), { timeout } = {}) {
  const root = runGit(["rev-parse", "--show-toplevel"], { cwd, timeout }).stdout;
  const gitDirText = runGit(["rev-parse", "--git-dir"], { cwd, timeout }).stdout;
  const commonText = runGit(["rev-parse", "--git-common-dir"], {
    cwd, timeout,
  }).stdout;
  return {
    root,
    gitDir: absoluteGitPath(gitDirText, root),
    gitCommonDir: absoluteGitPath(commonText, root),
    branch: runGit(["branch", "--show-current"], { cwd, timeout }).stdout,
  };
}

function absoluteGitPath(value, root) {
  return isAbsolute(value) ? resolve(value) : resolve(root, value);
}
