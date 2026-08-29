# Agent development

Start every tracked change from an isolated worktree. The canonical policy is
[`AGENTS.md`](../../AGENTS.md); this directory explains the mechanics without
repeating that policy.

## First-run checklist

1. Read `AGENTS.md` and the nearest nested `AGENTS.md` for the intended area.
2. From the root checkout, inspect current work with
   `node scripts/agents/status.mjs`.
3. Create a task workspace with
   `node scripts/agents/create-worktree.mjs <topic>`.
4. Work, test, review, and commit only inside `.worktrees/<topic>`.
5. Follow the serialized integration and publication flow in
   [releasing.md](releasing.md).

## Guides

- [Architecture](architecture.md)
- [Feature map](feature-map.md)
- [Worktrees](worktrees.md)
- [Testing](testing.md)
- [Releasing](releasing.md)
