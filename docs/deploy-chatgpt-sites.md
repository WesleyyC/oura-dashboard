# Deploy to ChatGPT Sites

This path uses ChatGPT Sites for the application runtime, signed-in identity,
and D1 binding. GitHub and Sites are separate release destinations: pushing
source to GitHub does not update a Site.

## Prerequisites

- A ChatGPT Sites project available to the Codex workspace.
- A dedicated D1 database bound to the logical name `DB`.
- An Oura OAuth application.
- The values described in [Configuration](configuration.md).

Check hosting eligibility before connecting people. The
[Sites documentation](https://learn.chatgpt.com/docs/sites) says not to use Sites
to process Protected Health Information or payment-card data, and states that
data and inference residency are not supported. This dashboard's privacy controls
do not override those platform restrictions or establish regulatory compliance.
Determine whether your intended data and use are eligible; do not assume that
every personal wellness record is PHI, or that every health-related use is allowed.

Sites code versions are not database backups. Complete the
[recovery readiness checklist](recovery.md#production-recovery-readiness) before
relying on the deployment for irreplaceable records.

## Configure the project

1. Copy the tracked template:

   ```bash
   cp .openai/hosting.example.json .openai/hosting.json
   ```

2. Replace `REPLACE_WITH_SITES_PROJECT_ID` with the Sites project ID. Keep
   `"d1": "DB"`. The resulting file is ignored and must remain local.
3. In the Sites project settings, set `AUTH_PROVIDER` to `chatgpt-sites`.
4. Add `OWNER_EMAIL_ALLOWLIST`, `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`,
   `OURA_TOKEN_ENCRYPTION_KEY`, and `SECURITY_RATE_LIMIT_KEY` as runtime secrets
   or protected environment values. Do not store their values in the hosting
   JSON.
5. Ensure the project packages and applies the SQL migrations from `drizzle/`
   to the bound D1 database.
6. Keep the Site's owner surface signed-in. The guest connection paths must
   remain reachable to invited profile owners:
   - `/connect/oura`
   - `/connect/oura/*`
   - `/api/oura/guest/*`

Private application routes still require both a valid Sites identity and an
email in `OWNER_EMAIL_ALLOWLIST`.

## Register Oura callbacks

After Sites assigns the final HTTPS hostname, register both exact URLs in the
Oura developer portal:

```text
https://YOUR_SITE_HOST/api/oura/callback
https://YOUR_SITE_HOST/api/oura/guest/callback
```

Do not point a public guest link at the owner callback. Each flow records its
type in a short-lived server-side OAuth state and rejects the other callback.

## Verify before publishing

From a clean checkout:

```bash
npm ci
npm run audit:public
npm test
npm run typecheck
npm run lint
git diff --check
```

See the [local-only installation rehearsal](installation-rehearsal.md) for the
parts that can be checked without accounts, live credentials or real records.

Publish the exact verified commit with the Sites workflow in Codex. Never add a
Sites credential to Git remotes, configuration files, or logs.

After deployment, verify:

- an allowlisted signed-in owner can open `/` and `/settings`;
- a signed-out or non-allowlisted user cannot read dashboard data;
- a guest invite opens `/connect/oura` without exposing any health data;
- both Oura callbacks complete only their matching flow;
- `/api/account` returns configuration presence only, never secret values; and
- response pages and guest routes are `no-store` and unindexable where expected.

If any identity, binding, migration, or callback check fails, stop and correct
the configuration before connecting real profiles.
