# Worktree workflow

## Create and inspect

From the clean root checkout:

```bash
node scripts/agents/status.mjs
node scripts/agents/create-worktree.mjs <topic>
```

The helper creates `.worktrees/<topic>` on `codex/<topic>`. It never fetches,
prunes, repairs, or changes another worktree.

Status inspection is bounded per Git command. An unavailable HEAD, failed
command, or timeout produces an **incomplete** report and a nonzero exit code;
it does not mean there are no changes or overlaps. Coordinate exact-file
ownership using read-only checks. Do not repair another task's workspace.

The creation helper reuses the root dependency installation only when both
manifests match and the installed host packages match the lockfile. Check an
installation without changing it with:

```bash
node scripts/agents/check-dependencies.mjs
```

An existing directory is not proof of a valid installation. If it is stale or
incomplete, follow the single-attempt installation policy in `AGENTS.md` inside
the task worktree. Do not replace the root installation while other tasks may
be using it. Checks using older dependencies are preliminary, not a release
gate; release validation requires the locked versions.

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
