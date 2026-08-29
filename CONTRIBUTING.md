# Contributing

Thank you for improving Oura Dashboard. Keep changes small, testable, and safe
for a public health-data repository.

## Set up

Use Node.js 22.13 or newer, then run:

```bash
npm ci
npm run agent:status
npm run agent:worktree -- your-topic
```

Read `AGENTS.md` and the nearest nested `AGENTS.md`. Tracked changes belong on
a short-lived `codex/<topic>` branch in its matching linked worktree; the root
checkout is integration-only.

## Privacy rules

- Use synthetic identities and health values in fixtures, migrations,
  screenshots, and examples.
- Never commit tokens, secrets, operator IDs, real email addresses, raw Oura
  responses, health-record bodies, or absolute local paths.
- Do not mix records between owners or profiles.
- Do not add Google Calendar access or locally infer unavailable Oura metrics.
- Keep `.openai/hosting.json`, `wrangler.jsonc`, `.env*`, `.dev.vars`, local D1
  state, and generated snapshots untracked.

Run the public audit before sharing a branch. If you need an extra local PII
check, put one private term per line in an ignored file and pass it without
printing the values:

```bash
npm run audit:public -- --denylist work/public-release-denylist.txt
```

## Verification

Start with the focused suite for the area you changed, then run the complete
gate:

```bash
npm run audit:public
npm test
npm run typecheck
npm run lint
git diff --check
```

Inspect the final diff. A change that affects authentication, tenancy,
encryption, guest routes, migrations, or release filtering needs explicit
negative-path tests.

## Pull requests

Explain the outcome, privacy/security impact, and commands you ran. Never paste
private audit matches or live payloads into a pull request. Contributions are
licensed under the MIT License.
