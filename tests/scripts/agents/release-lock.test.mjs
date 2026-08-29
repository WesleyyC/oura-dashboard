import assert from "node:assert/strict";
import {
  access,
  mkdir,
  readlink,
  realpath,
  symlink,
  utimes,
} from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { repositoryContext } from "../../../scripts/agents/lib/git.mjs";
import { createTaskWorktree } from "../../../scripts/agents/create-worktree.mjs";
import {
  acquireLock,
  heartbeatLock,
  inspectLock,
  releaseLock,
} from "../../../scripts/agents/release-lock.mjs";
import { createGitFixture } from "./git-fixture.mjs";

test("release lock is atomic, live, heartbeatable, and owner-checked", async (t) => {
  const fixture = await createGitFixture(t);
  const first = await createTaskWorktree("first-task", fixture.root);
  const second = await createTaskWorktree("second-task", fixture.root);

  await assert.rejects(
    () => acquireLock({ cwd: fixture.root }),
    /codex.*linked worktree|task worktree/i,
  );
  const nestedPath = join(first.path, "features");
  await mkdir(nestedPath);
  await assert.rejects(
    () => acquireLock({ cwd: nestedPath }),
    /worktree root/i,
  );

  const acquired = await acquireLock({ cwd: first.path });
  assert.equal(
    await readlink(join(acquired.path, "owner")),
    await realpath(first.path),
  );
  assert.equal((await inspectLock({ cwd: second.path })).state, "live");
  await assert.rejects(
    () => acquireLock({ cwd: second.path }),
    /live release lock/i,
  );

  const heartbeat = await heartbeatLock({ cwd: first.path });
  assert.equal(heartbeat.ownerPath, await realpath(first.path));
  await assert.rejects(
    () => releaseLock({ cwd: second.path }),
    /owner/i,
  );
  await releaseLock({ cwd: first.path });
  await assert.rejects(() => access(acquired.path), /ENOENT/);
});

test("inspection reports stale heartbeat without stealing it", async (t) => {
  const fixture = await createGitFixture(t);
  const task = await createTaskWorktree("stale-task", fixture.root);
  const context = repositoryContext(task.path);
  const lockPath = join(context.gitCommonDir, "codex-release.lock");
  await mkdir(lockPath);
  await symlink(await realpath(task.path), join(lockPath, "owner"));
  const heartbeatPath = join(lockPath, "heartbeat");
  await mkdir(heartbeatPath);
  const now = new Date("2026-08-01T12:00:00.000Z");
  const old = new Date(now.getTime() - 2 * 60 * 60 * 1_000);
  await utimes(heartbeatPath, old, old);

  const inspection = await inspectLock({ cwd: task.path, now });
  assert.equal(inspection.state, "stale");
  assert.equal(inspection.ageMs, 2 * 60 * 60 * 1_000);
  await assert.rejects(
    () => acquireLock({ cwd: task.path, now }),
    /stale release lock/i,
  );
  assert.equal(await readlink(join(lockPath, "owner")), await realpath(task.path));
});

test("missing heartbeat uses lock directory age", async (t) => {
  const fixture = await createGitFixture(t);
  const task = await createTaskWorktree("missing-heartbeat", fixture.root);
  const context = repositoryContext(task.path);
  const lockPath = join(context.gitCommonDir, "codex-release.lock");
  await mkdir(lockPath);
  await symlink(await realpath(task.path), join(lockPath, "owner"));
  const now = new Date("2026-08-01T12:00:00.000Z");
  const old = new Date(now.getTime() - 2 * 60 * 60 * 1_000 - 1);
  await utimes(lockPath, old, old);

  assert.equal((await inspectLock({ cwd: task.path, now })).state, "stale");
});
