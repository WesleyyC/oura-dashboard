# Privacy

Oura Dashboard is self-hosted software. The person or organization operating a
deployment controls its database, identity provider, Oura application, access
policy, backups, logs, retention, and user support. This repository does not
operate a shared service and its maintainers do not receive your deployment's
health data.

## Data a deployment processes

- A stable owner identifier supplied by the configured identity boundary.
- Owner email addresses transiently used for allowlist checks. The application
  database stores the stable owner identifier, not the email address.
- Profile display names, ordering, colors, and connection status.
- Encrypted Oura access and refresh tokens, granted scopes, and expiry times.
- Daily Oura aggregates: scores, sleep durations and efficiency, breathing and
  heart-rate signals, HRV, resting heart rate, temperature deviation, stress
  and recovery time, steps, calories, activity and sedentary time, walking
  distance, and aggregate workout totals.
- OAuth state, guest-invite hashes, synchronization metadata, safe error codes,
  and keyed rate-limit digests with short expirations.

The app does not query or store Google Calendar data, infer location from IP,
or intentionally store raw Oura API response bodies. Missing values remain
missing rather than being inferred.

## Where data goes

Application records are stored in the operator's Cloudflare D1 database.
OAuth requests and refreshes communicate with Oura. Identity is provided by
ChatGPT Sites or Cloudflare Access, depending on the deployment. Platform
providers may process request metadata according to the operator's account and
their own terms.

## Operator responsibilities

Before inviting another person, explain who operates the deployment, what data
is collected, why it is used, who can access it, how long it is kept, and how
the person can request deletion. Obtain any consent required in your
jurisdiction.

Use a dedicated D1 database and Oura OAuth application; restrict owner access;
keep secrets out of source control and logs; review platform logging and backup
settings; define a retention and deletion process; and avoid using production
health data in issues, tests, screenshots, or support messages.

Deleting an account or profile through the application removes its active
tenant-scoped rows. Cloudflare backups, logs, and copies outside the application
follow the operator's platform configuration and must be handled separately.

This document describes the software, not a complete privacy notice for every
deployment. Operators should publish a notice appropriate to their use and
jurisdiction.
