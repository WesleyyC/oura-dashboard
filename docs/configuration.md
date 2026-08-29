# Configuration

Oura Dashboard reads deployment values from the Worker runtime and stores
application data in a Cloudflare D1 binding named `DB`. Keep real values in the
hosting platform's secret store, never in tracked files.

## Runtime values

| Name | Required | Purpose |
| --- | --- | --- |
| `AUTH_PROVIDER` | Yes | `chatgpt-sites` or `cloudflare-access`. Any other or missing value leaves owner requests anonymous. |
| `OWNER_EMAIL_ALLOWLIST` | Yes | Comma-separated owner emails allowed to use private routes. Matching is case-insensitive. Keep it private because it is PII. |
| `OURA_CLIENT_ID` | Yes | Client ID for the operator's Oura OAuth application. |
| `OURA_CLIENT_SECRET` | Yes | Client secret for that Oura application. |
| `OURA_TOKEN_ENCRYPTION_KEY` | Yes | Random 32-byte base64url key used for AES-GCM encryption of Oura tokens at rest. |
| `SECURITY_RATE_LIMIT_KEY` | Yes | A different random 32-byte base64url key used to HMAC rate-limit actors. |
| `CLOUDFLARE_ACCESS_TEAM_DOMAIN` | Cloudflare Access only | Exact team domain, such as `team-name.cloudflareaccess.com`. |
| `CLOUDFLARE_ACCESS_AUD` | Cloudflare Access only | Application Audience (AUD) tag for the protected root application. |

Generate each random key separately:

```bash
node --input-type=module -e 'import { randomBytes } from "node:crypto"; console.log(randomBytes(32).toString("base64url"))'
```

Do not reuse the encryption and rate-limit keys. Back up the encryption key in
an appropriate secret manager: losing it prevents stored Oura credentials from
being decrypted. If it is exposed, revoke connected Oura credentials and
rotate the key.

## Hosting files

ChatGPT Sites uses an ignored `.openai/hosting.json` copied from
`.openai/hosting.example.json`. Set its `project_id` and keep the D1 logical
binding as `DB`.

Cloudflare Workers uses an ignored `wrangler.jsonc` copied from
`wrangler.example.jsonc`. Replace the account, route, D1, Access team, and
Access audience placeholders. Put sensitive and personal runtime values in
Cloudflare secrets rather than `vars`.

The examples are safe to commit. The operator copies are not. The repository's
`.gitignore` and public audit enforce that boundary.

## Oura OAuth application

Create a dedicated Oura OAuth application for each deployment. Register these
two exact redirect URLs using the final HTTPS origin:

```text
https://dashboard.example.com/api/oura/callback
https://dashboard.example.com/api/oura/guest/callback
```

The application requests Oura's `daily` and `workout` scopes. Redirect origins
must use HTTPS except for `localhost` development. If the hostname changes,
update both Oura callbacks before reconnecting profiles.

## Identity behavior

In `chatgpt-sites` mode, the Worker accepts only the identity headers supplied
by ChatGPT Sites. In `cloudflare-access` mode, the Worker discards unsigned
identity headers and verifies `Cf-Access-Jwt-Assertion` against the configured
team keys, issuer, audience, signature, expiry, subject, and email.

The owner allowlist is an application-level second check in both modes. Missing
or malformed identity configuration fails closed. Do not add a development
bypass to production.

## D1

Use a dedicated D1 database and the binding name `DB`. Apply every migration in
`drizzle/` in order. Do not seed a deployment with real records from another
operator or profile.

The database contains profile metadata, encrypted Oura tokens, daily aggregate
health records, synchronization state, short-lived OAuth/invite hashes, and
keyed rate-limit buckets. Review [Privacy](../PRIVACY.md) before inviting users.

## Local files

`.env.example` lists names only. Copy it to an ignored `.env.local` or
`.dev.vars` as appropriate for local tools, and never paste values into an
issue, pull request, build log, or chat. Owner routes intentionally fail closed
without a real supported identity boundary.
