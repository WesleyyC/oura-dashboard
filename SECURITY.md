# Security policy

## Report a vulnerability

Privately report suspected vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/WesleyyC/oura-dashboard/security/advisories/new).
Do not open a public issue containing a credential, access token, account
identifier, health record, Oura response, or a reproducible exploit against a
live deployment.

Include the affected commit, impact, safe reproduction steps, and any proposed
mitigation. Use synthetic data and redact request headers and response bodies.
You should receive an initial acknowledgement within seven days. There is no
bug-bounty program or guaranteed remediation timeline.

## Supported versions

Security fixes are made on the current `main` branch. Public deployments are
operator-managed, so each operator is responsible for updating and rotating
affected credentials.

## Security boundaries

- Owner routes require a verified ChatGPT Sites or Cloudflare Access identity
  and a matching `OWNER_EMAIL_ALLOWLIST` entry.
- Cloudflare Access mode verifies the signed JWT, issuer, audience, expiry,
  subject, and email. Unsigned identity headers are discarded.
- Oura OAuth tokens are encrypted at rest with
  `OURA_TOKEN_ENCRYPTION_KEY`. Losing that key makes stored credentials
  unrecoverable; exposing it requires token revocation and key rotation.
- Runtime secrets and operator deployment files must never be committed.
- The anonymous guest surface is intentionally limited to profile connection.
  It must not be expanded to return dashboard or health data.

See [Configuration](docs/configuration.md) and [Privacy](PRIVACY.md) for the
operator checklist.
