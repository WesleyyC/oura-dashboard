# Deploy to Cloudflare Workers

This path runs the vinext application on Cloudflare Workers, stores records in
D1, and uses Cloudflare Access as the trusted identity boundary. A custom
domain is required so Access cannot be bypassed through a public
`workers.dev` hostname.

Cloudflare's current documentation covers
[vinext on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/),
[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/),
[Access application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/),
and [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## 1. Create the local operator config

First-time operators can run the [local-only installation rehearsal](installation-rehearsal.md)
without cloud accounts or credentials before proceeding with the real deployment.

```bash
npm ci
npx wrangler login
cp wrangler.example.jsonc wrangler.jsonc
npx wrangler d1 create oura-dashboard
```

Replace every `REPLACE_...` value in the ignored `wrangler.jsonc`. Preserve:

- `main: "worker/index.ts"`;
- `workers_dev: false`;
- the `DB` D1 binding and `drizzle` migrations directory;
- `AUTH_PROVIDER: "cloudflare-access"`; and
- one custom-domain route for the final dashboard hostname.

Apply the schema to the named remote database:

```bash
npx wrangler d1 migrations list oura-dashboard --remote
npx wrangler d1 migrations apply oura-dashboard --remote
```

## 2. Configure Cloudflare Access

In Zero Trust, create a self-hosted Access application for the complete custom
hostname. Give it an Allow policy limited to the intended owner email or group;
do not use `Everyone` or all valid emails for the owner application.

Create narrowly scoped, more-specific Access applications with a Bypass / Include
Everyone policy for only these guest paths:

```text
/connect/oura
/connect/oura/*
/api/oura/guest/*
/assets/*
/brand/*
```

More-specific application paths take precedence over the root application.
Bypass disables Access controls and logging for matching traffic, so do not
broaden these patterns. `/assets/*` contains hashed client JavaScript and CSS;
`/brand/*` contains public artwork. They are required for the anonymous guest
page to function and contain no account or health records. The remaining guest
paths are limited to connection state and do not return dashboard health data.

From the root Access application's settings, copy:

- the team domain into `CLOUDFLARE_ACCESS_TEAM_DOMAIN`; and
- the Application Audience (AUD) tag into `CLOUDFLARE_ACCESS_AUD`.

The Worker validates the signed `Cf-Access-Jwt-Assertion` itself. Merely adding
Access or trusting `Cf-Access-Authenticated-User-Email` is not sufficient.

## 3. Create a fail-closed first deployment

Run the complete local gate, then deploy once with the identity and D1 config in
place. Oura operations remain unavailable until their secrets are added.

```bash
npm run audit:public
npm test
npm run typecheck
npm run lint
npm run deploy:cloudflare
```

Confirm the custom hostname is behind Access and the `workers.dev` route is
disabled before adding Oura credentials.

## 4. Add runtime secrets

Add each value without placing it on the command line:

```bash
npx wrangler secret put OWNER_EMAIL_ALLOWLIST
npx wrangler secret put OURA_CLIENT_ID
npx wrangler secret put OURA_CLIENT_SECRET
npx wrangler secret put OURA_TOKEN_ENCRYPTION_KEY
npx wrangler secret put SECURITY_RATE_LIMIT_KEY
```

Use distinct random values for the encryption and rate-limit keys. Cloudflare
stores Worker secrets separately from source and does not reveal their values
after creation.

## 5. Register callbacks and deploy

Register both final custom-domain URLs with the Oura application:

```text
https://dashboard.example.com/api/oura/callback
https://dashboard.example.com/api/oura/guest/callback
```

Then deploy the verified source again:

```bash
npm run deploy:cloudflare
```

## 6. Verify the boundary

- The root, `/settings`, `/api/account`, `/api/health`, and
  `/api/oura/callback` require Access and the application allowlist.
- A non-allowlisted Access user receives no dashboard data.
- The five guest/static path patterns are reachable without Access; guest
  endpoints return no health records or owner configuration, and static paths
  contain files only.
- A forged unsigned `oai-authenticated-user-*` or
  `Cf-Access-Authenticated-User-Email` header never authenticates a request.
- A missing, expired, wrongly issued, wrongly addressed, or invalidly signed
  Access assertion fails closed.
- Both OAuth callbacks reject state issued for the other flow.
- D1 contains only the current deployment's data and every migration is
  applied.

Review Cloudflare logs and D1 backup/retention settings without printing health
records or credentials. See [Privacy](../PRIVACY.md) for ongoing operator
responsibilities.

The example pins the compatibility date to `2026-08-29`, the first public
release baseline verified by this repository. Treat a compatibility-date change
as a runtime upgrade: test it in a separate Worker and D1 database, verify the
identity and both OAuth flows, then monitor authentication failures, safe sync
status, and Worker errors after rollout. If runtime behavior regresses, redeploy
the last verified commit with its previous compatibility date. Database
migrations are forward changes; restore D1 from a platform backup instead of
attempting an ad-hoc SQL rollback.
