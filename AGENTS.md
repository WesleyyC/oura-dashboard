# Project agent instructions

## Instruction precedence

`AGENTS.md` is the canonical repository policy. Tool-specific adapter files
must point here and must not copy these rules. Read the nearest nested
`AGENTS.md` before changing a feature, platform area, or test directory.

## Mandatory isolated workspace

Every tracked change, including documentation, must be made on a short-lived
`codex/<topic>` branch in the matching `.worktrees/<topic>` linked worktree.
The root checkout on `main` is integration-only: inspect from it, but do not
edit, stage, or commit tracked files there.

Before editing, run `node scripts/agents/status.mjs` and inspect exact-file
overlap with live branches. Exact overlap is a coordination event; it never
authorizes overwriting another task.

## Mandatory delivery workflow

Inspect `git worktree list` before starting. Never modify, stage, merge, repair,
prune, remove, or delete another task's live worktree or branch.

Run the task-appropriate tests and inspect the intended diff. When checks pass,
commit the change. Fetch `origin`, update a clean `main`, merge the task branch
directly into `main`, and rerun the task-appropriate checks on that exact merged
commit before pushing `main` to `origin`. If the push is rejected, fetch,
reintegrate, and reverify; never force-push. This is standing authorization: do
not pause for another merge or push approval. For agent work, review means
inspecting the diff and completing the required verification unless the user
explicitly asks for a pull request or human review. Never overwrite concurrent
work; report a real merge conflict.

For changes that affect the built site, there is standing authorization to
publish the exact verified, merged `main` commit to the project's existing
public OpenAI Sites deployment. Public reachability is not a reason to request
another confirmation. Follow `docs/sites-publishing.md`, wait for a successful
deployment, and verify expected routes. Documentation-only changes that do not
alter the built site do not require a no-op Sites deployment.

Before updating `main`, acquire the repository-wide release mutex by atomically
creating `codex-release.lock` inside the absolute `git rev-parse
--git-common-dir` directory, then place an `owner` symlink inside the lock that
points to the task worktree. If the lock already exists, do not merge, push,
publish, or clean up. Read its owner and heartbeat, then wait or report the
blocker. A lock is stale only when its existing `heartbeat` is at least two
hours old, or when the heartbeat is missing and the lock directory itself is at
least two hours old. Only then may an agent remove it and retry acquisition
once. A younger lease is live even if its owner worktree has just been removed
during cleanup. Never steal a live or ambiguous lock.

Acquire the mutex with this atomic `mkdir` sequence from the task worktree:

```bash
release_owner_path=$(pwd -P)
release_git_common_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
release_lock_path="$release_git_common_dir/codex-release.lock"
if ! mkdir "$release_lock_path"; then
  exit 1
fi
if ! ln -s "$release_owner_path" "$release_lock_path/owner" ||
  ! touch "$release_lock_path/heartbeat"; then
  test ! -L "$release_lock_path/owner" || unlink "$release_lock_path/owner"
  rmdir "$release_lock_path"
  exit 1
fi
```

Refresh the heartbeat with `touch "$release_lock_path/heartbeat"` at least once
per hour, immediately before and after every long network operation, and
immediately before removing the owner worktree. If the heartbeat cannot be
refreshed, stop the release without deploying or cleaning up further.

Hold the mutex across the complete merge, push, publish, verification, and
cleanup phase. Immediately before deploying, fetch `origin` again and require
the release SHA to equal `origin/main`. If `origin/main` changed, do not deploy
the stale version; reintegrate the latest `main`, rerun the release gate, and
publish only the newly verified commit. After successful cleanup, only the lock
owner removes the `owner` symlink and lock directory. Confirm the recorded owner
matches before releasing with `unlink "$release_lock_path/owner"`, then
`unlink "$release_lock_path/heartbeat"`, followed by
`rmdir "$release_lock_path"`.

After the merged commit is pushed and any required deployment is verified,
remove only the completed task's linked worktree, delete its local branch, and
delete its remote branch if it was pushed. Leave unrelated worktrees and
branches intact. Do not use force cleanup to hide uncommitted or unmerged work.

## Known macOS npm installation issue

On macOS, npm installation in linked worktrees is known to fail with cache
permission or `EEXIST` errors, or `Exit handler never called`. Treat these as
known npm tooling failures, not product defects. Do not spend task time
rediscovering or debugging them.

If the main checkout already has a valid `node_modules` and the worktree's
`package.json` and `package-lock.json` are unchanged from `main`, a nested
`.worktrees/<topic>` checkout should reuse it with the ignored local symlink
`node_modules -> ../../node_modules`; do not run `npm install` or `npm ci`
merely because the worktree lacks its own dependency directory. Never reuse the
shared installation after changing either dependency manifest.

If installation is genuinely required, including after a dependency-manifest
change, install only inside the task worktree and make one attempt using the
isolated writable project cache:

```bash
npm ci --ignore-scripts --prefer-offline --no-audit --no-fund \
  --cache work/npm-cache
```

If that attempt produces a known symptom, stop. Do not retry, modify the global
cache, change ownership or permissions, or try alternate package managers.
Report the setup blocker and continue only with checks supported by an existing
dependency installation.

## Health-data and credential boundaries

Never print, commit, or expose credentials, tokens, raw Oura responses, Oura
payloads, or health-record bodies. Preserve owner and profile isolation and the
repository's no-Google-Calendar boundary. Follow the focused runbooks in
`docs/` for refresh, verification, and publishing details.
