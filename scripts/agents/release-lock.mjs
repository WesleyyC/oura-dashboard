import {
  mkdir,
  readlink,
  realpath,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { repositoryContext } from "./lib/git.mjs";

const STALE_AFTER_MS = 2 * 60 * 60 * 1_000;

export async function inspectLock({
  cwd = process.cwd(),
  now = new Date(),
} = {}) {
  const context = repositoryContext(cwd);
  const path = join(context.gitCommonDir, "codex-release.lock");
  let lockStat;
  try {
    lockStat = await stat(path);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        state: "missing",
        path,
        ownerPath: null,
        heartbeatAt: null,
        ageMs: null,
      };
    }
    throw error;
  }
  let ownerPath = null;
  try {
    ownerPath = await readlink(join(path, "owner"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let heartbeatStat = null;
  try {
    heartbeatStat = await stat(join(path, "heartbeat"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const leaseTime = heartbeatStat?.mtime ?? lockStat.mtime;
  const ageMs = Math.max(0, now.getTime() - leaseTime.getTime());
  return {
    state: ageMs >= STALE_AFTER_MS ? "stale" : "live",
    path,
    ownerPath,
    heartbeatAt: heartbeatStat ? heartbeatStat.mtime.toISOString() : null,
    ageMs,
  };
}

export async function acquireLock({
  cwd = process.cwd(),
  now = new Date(),
} = {}) {
  const context = repositoryContext(cwd);
  const ownerPath = await assertTaskWorktreeRoot(context, cwd);
  const path = join(context.gitCommonDir, "codex-release.lock");
  try {
    await mkdir(path);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await inspectLock({ cwd, now });
    throw new Error(
      existing.state === "stale"
        ? "A stale release lock requires manual review"
        : "A live release lock already exists",
    );
  }
  let ownerCreated = false;
  let heartbeatCreated = false;
  try {
    await symlink(ownerPath, join(path, "owner"));
    ownerCreated = true;
    await writeFile(join(path, "heartbeat"), "");
    heartbeatCreated = true;
    await utimes(join(path, "heartbeat"), now, now);
    return { path, ownerPath, heartbeatAt: now.toISOString() };
  } catch (error) {
    if (heartbeatCreated) await unlink(join(path, "heartbeat")).catch(() => {});
    if (ownerCreated) await unlink(join(path, "owner")).catch(() => {});
    await import("node:fs/promises").then(({ rmdir }) => rmdir(path)).catch(() => {});
    throw error;
  }
}

export async function heartbeatLock({
  cwd = process.cwd(),
  now = new Date(),
} = {}) {
  const context = repositoryContext(cwd);
  const expectedOwner = await assertTaskWorktreeRoot(context, cwd);
  const path = join(context.gitCommonDir, "codex-release.lock");
  const recordedOwner = await readlink(join(path, "owner"));
  if (resolve(recordedOwner) !== resolve(expectedOwner)) {
    throw new Error("Release lock owner does not match this worktree");
  }
  await writeFile(join(path, "heartbeat"), "", { flag: "a" });
  await utimes(join(path, "heartbeat"), now, now);
  return {
    path,
    ownerPath: recordedOwner,
    heartbeatAt: now.toISOString(),
  };
}

async function assertTaskWorktreeRoot(context, cwd) {
  const cwdPath = await realpath(cwd);
  const ownerPath = await realpath(context.root);
  if (resolve(cwdPath) !== resolve(ownerPath)) {
    throw new Error("Release lock operations must run from the worktree root");
  }
  const branchMatch = /^codex\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(
    context.branch,
  );
  if (!branchMatch || resolve(context.gitDir) === resolve(context.gitCommonDir)) {
    throw new Error("Release lock acquisition requires a codex task linked worktree");
  }
  const expectedPath = resolve(
    dirname(context.gitCommonDir),
    ".worktrees",
    branchMatch[1],
  );
  if (resolve(ownerPath) !== expectedPath) {
    throw new Error("Release lock owner does not match its codex task worktree");
  }
  return ownerPath;
}

export async function releaseLock({
  cwd = process.cwd(),
  ownerPath,
} = {}) {
  const context = repositoryContext(cwd);
  const path = join(context.gitCommonDir, "codex-release.lock");
  const recordedOwner = await readlink(join(path, "owner"));
  const expectedOwner = ownerPath
    ? resolve(ownerPath)
    : resolve(await realpath(cwd));
  if (ownerPath) {
    const worktreeRoot = resolve(context.root, ".worktrees") + "/";
    if (!expectedOwner.startsWith(worktreeRoot)) {
      throw new Error("Release owner path is outside this repository's worktrees");
    }
  }
  if (resolve(recordedOwner) !== expectedOwner) {
    throw new Error("Release lock owner does not match this worktree");
  }
  await unlink(join(path, "owner"));
  try {
    await unlink(join(path, "heartbeat"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const { rmdir } = await import("node:fs/promises");
  await rmdir(path);
}

async function main() {
  const action = process.argv[2];
  const ownerIndex = process.argv.indexOf("--owner-path");
  const ownerPath = ownerIndex >= 0 ? process.argv[ownerIndex + 1] : undefined;
  try {
    let result;
    if (action === "inspect") result = await inspectLock();
    else if (action === "acquire") result = await acquireLock();
    else if (action === "heartbeat") result = await heartbeatLock();
    else if (action === "release") result = await releaseLock({ ownerPath });
    else throw new Error("Release lock action must be acquire, heartbeat, inspect, or release");
    process.stdout.write(`${result ? JSON.stringify(result) : "Release lock removed"}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Release lock operation failed"}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
