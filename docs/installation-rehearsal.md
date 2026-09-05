# Local-only installation rehearsal

Use a fresh disposable checkout, Node 22.13+ and npm. Do not copy an operator's
`.env*`, `.dev.vars`, `.openai/hosting.json`, `wrangler.jsonc`, database files or
`node_modules` into it. Nothing here creates a cloud resource or requires Oura
credentials. Repository agents must use their own isolated worktree and follow
the one-attempt npm installation policy in `AGENTS.md`.

```bash
npm ci --ignore-scripts --prefer-offline --no-audit --no-fund --cache work/npm-cache
node scripts/agents/check-dependencies.mjs
npm test
npm run typecheck
npm run lint
npm run check:architecture
npm run audit:public
```

With no operator config, the build supplies a local logical `DB` binding. It does
not log you in, create an owner or provision a production database. Missing trusted
identity deliberately leaves owner routes inaccessible.

## Worker preview, not a standalone Node server

After building, run in one terminal:

```bash
WRANGLER_SEND_METRICS=false npm start -- --port 5176
```

Wait for `Ready on http://127.0.0.1:5176`, then in a second terminal run:

```bash
node tests/scripts/local-preview-smoke.mjs
```

The probe permits only loopback, checks response status/headers without reading
record bodies, and never completes sign-in or OAuth. Anonymous pages redirect,
unsigned owner APIs return 401/no-store, and the public guest landing page renders.
Stop the preview with Ctrl-C. Do not expose its inspector or local database browser
over a public interface. `npm start` now uses Wrangler's local Worker runtime:
vinext's Node production server does not provide this application's `env` bindings
and previously returned 500 errors. It is not a supported self-hosting target.

## Self-hosting configuration and local database

In this disposable checkout only, create ignored `wrangler.jsonc` with:

```json
{
  "name": "oura-synthetic-rehearsal",
  "main": "worker/index.ts",
  "compatibility_date": "2026-08-29",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": false,
  "d1_databases": [{
    "binding": "DB",
    "database_name": "oura-synthetic-rehearsal",
    "database_id": "00000000-0000-4000-8000-000000000000",
    "migrations_dir": "drizzle"
  }],
  "vars": {
    "AUTH_PROVIDER": "cloudflare-access",
    "CLOUDFLARE_ACCESS_TEAM_DOMAIN": "team-name.cloudflareaccess.com",
    "CLOUDFLARE_ACCESS_AUD": "REPLACE_WITH_ACCESS_APPLICATION_AUD"
  }
}
```

The dummy database ID is not a deployable cloud resource. Every database command
below must keep `--local`; never add `--remote` or reuse production config.

```bash
WRANGLER_SEND_METRICS=false npx wrangler d1 migrations apply DB --local
npm run build
WRANGLER_SEND_METRICS=false npx wrangler deploy --dry-run --config dist/server/wrangler.json --outdir work/cloudflare-dry-run
WRANGLER_SEND_METRICS=false npx wrangler d1 export DB --local --output work/d1-synthetic.sql
WRANGLER_SEND_METRICS=false npx wrangler d1 execute DB --local --persist-to work/d1-restored --file work/d1-synthetic.sql
WRANGLER_SEND_METRICS=false npx wrangler d1 execute DB --local --persist-to work/d1-restored --command 'SELECT COUNT(*) AS migrations FROM d1_migrations; SELECT COUNT(*) AS profiles FROM health_profiles;'
```

Use a new `work/d1-restored` directory, not an earlier import target. Wrangler
4.127.1's export command has no `--persist-to` option: it exports the default
local state populated by the first command. Do not substitute a different source.
On this release, expect nine migrations and zero profiles. The export contains
only the empty synthetic schema. Real exports need private encrypted storage
outside this repository and are outside this rehearsal's scope.

For encryption, owner isolation and restored synthetic records, also run:

```bash
node --import tsx --test tests/features/oura-connection/recovery-drill.test.mjs
```

## Sites and remaining account-dependent checks

In another clean checkout, follow [Sites setup](deploy-chatgpt-sites.md) using
your own Site and its ignored hosting link; do not retain the self-hosting Wrangler
file, which takes precedence over local binding generation. Build and package
with the Sites workflow. No project IDs or credentials belong in public source.

The 2026-09-04 rehearsal verified a clean dependency install, the default and
self-hosting builds, all nine local migrations, dry-run Worker packaging, local
schema export/import, and the offline synthetic vault drill. SQLite integrity
and foreign-key checks on the restored local file passed. D1 does not expose every
SQLite pragma through its API; do not mistake an unsupported pragma for corruption.
Sites release packaging is checked separately during publication.

This does **not** verify a new operator's account provisioning, DNS/Access policy,
OAuth consent, live secret configuration or production database recovery. Complete
the target guide's signed-in and guest checks using the new operator's accounts
before inviting people. Public reachability alone is not an authentication test.
