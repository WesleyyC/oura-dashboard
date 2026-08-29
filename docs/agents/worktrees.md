# Worktree workflow

## Create and inspect

From the clean root checkout:

```bash
node scripts/agents/status.mjs
node scripts/agents/create-worktree.mjs <topic>
```

The helper creates `.worktrees/<topic>` on `codex/<topic>`. It never fetches,
prunes, repairs, or changes another worktree.

## Repository relocation

After moving the repository, inspect physical `.worktrees/` directories and
branch reachability before changing Git administration. Preserve live work with
`git worktree repair .worktrees/<topic>`. Use `git worktree prune` only after
every affected worktree and branch is confirmed disposable.

## Integrate and clean up

Commit and verify in the task worktree. During release, acquire the mutex,
update clean `main`, merge, reverify the merged commit, push, publish when
required, and verify routes. Remove only the completed task worktree and branch
after the release succeeds. Never use force cleanup to conceal unfinished work.
