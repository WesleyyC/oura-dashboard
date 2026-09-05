# Publishing releases

GitHub, ChatGPT Sites, and Cloudflare Workers are separate destinations. A
GitHub push shares source but does not deploy a dashboard.

Use the target-specific operator guide:

- [Deploy to ChatGPT Sites](deploy-chatgpt-sites.md)
- [Deploy to Cloudflare Workers](deploy-cloudflare.md)

## Release gate

Publish only an exact, clean commit that has passed:

```bash
npm run audit:public
node scripts/agents/check-dependencies.mjs
npm test
npm run typecheck
npm run lint
git diff --check
git status --short --branch
git rev-parse HEAD
```

Ignored operator configuration may be present locally during verification.
It must remain untracked: the public checks inspect Git membership, not whether
the operator has configured a local checkout. Do not delete working operator
configuration to make tests pass.

Require all three GitHub checks, `verify`, `browser-tests`, and
`management-browser-tests`, before merging a
release. Preserve strict/up-to-date checks, administrator enforcement, and the
existing pull-request rules. Browser tests use fictional records only; see
[Testing](agents/testing.md). CI validates code and does not deploy it.

If source changes after the gate, repeat it and publish the new SHA. Never
print or upload Oura tokens, deployment credentials, raw health responses, raw
Oura payloads, owner identifiers, or profile records during verification.

Repository agents must also follow the release mutex and integration workflow
in `AGENTS.md`. The lock is coordination state, not deployment authorization.

## Stop conditions

- A failed test, type-check, lint, build, audit, migration, or packaging step.
- A dirty worktree or a release SHA that differs from the intended source.
- Missing identity, allowlist, secret, D1, or OAuth callback configuration.
- An owner route reachable without the configured trusted identity boundary.
- A guest route that exposes owner configuration or health data.
- An unexpected access policy or broader-than-documented public path.

After deployment, verify authentication, anonymous guest boundaries, both OAuth
flows, expected routes, and D1 migration state using synthetic or metadata-only
checks.
