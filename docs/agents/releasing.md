# Serialized release workflow

Only one worktree may integrate, push, publish, and clean up at a time. The
mutex is `codex-release.lock` under the path returned by
`git rev-parse --git-common-dir`.

## Mutex lifecycle

From the task worktree:

```bash
node scripts/agents/release-lock.mjs inspect
node scripts/agents/release-lock.mjs acquire
node scripts/agents/release-lock.mjs heartbeat
```

A heartbeat is live for two hours. A missing heartbeat uses the lock directory
age, also with a two-hour threshold. Never steal a live or ambiguous lock.
Refresh immediately before and after long network operations and immediately
before removing the owner worktree.

After removing the owner worktree, release from the root checkout with the
exact owner path captured by `pwd -P` before removal:

```bash
node scripts/agents/release-lock.mjs release --owner-path <captured-task-path>
```

The helper requires that path to match the recorded owner and rejects paths
outside this repository's `.worktrees/` directory.

## Integration and publication

Fetch `origin`, update a clean root `main` with `--ff-only`, merge the task
branch, and run the complete verification gate on that exact commit. Push
without force. Immediately before Sites publication, fetch again and require
`HEAD` to equal `origin/main`; otherwise reintegrate and reverify.

## Cleanup and recovery

After push, deployment, and route verification succeed, remove only the
completed worktree and branch. Release the mutex only when its recorded owner
matches the task path. Remove `owner`, then `heartbeat`, then the lock directory.
If any owner or heartbeat check fails, stop without broader cleanup.
