# Sync diagnosis and recovery

Use this runbook on demand. It does not create a monitor, scheduled refresh,
backup job, or automatic deployment. Never paste health rows, OAuth responses,
invite links, credentials, database exports, or secret values into logs or issues.

## Diagnose before changing anything

Open Settings → Sync diagnostics and recovery → Check sync status. The owner-only
`GET /api/oura/diagnostics` returns a bounded, non-cacheable metadata report:
status, last attempt/success, completed attempt duration, rows in the last
successful refresh, and an allowlisted error category. It excludes names,
emails, date-by-date health values, tokens and lease identifiers. Settings maps
the report to names already loaded for the current owner. This is current sync
state, not an event log or a count of every record in storage.

| Result | Next action |
| --- | --- |
| Refreshing | Wait; one profile's lease lasts at most five minutes. Do not force-unlock it. |
| Interrupted | The request exceeded its deadline or its lease expired. Retry once after the lease expires. |
| Authorization required | Reconnect only that person's Oura account. |
| Configuration missing | Check runtime credential presence and operator configuration privately. Reconnecting is not the fix. |
| Rate limited / Oura unavailable | Retry later. Keep the existing connection and cached data. |
| Storage failed / unexpected | Check platform availability and recent changes; report only the safe category and release SHA. |

After a long absence, normal refresh catches up from the previous successful
local day, bounded to six months. Older releases may already have left gaps
behind a more recent success timestamp. For those, select one connected person
and choose **Repair six-month history**. Confirm the request; existing cached
data stays visible. Repair shares the ordinary lease, deadline, token handling,
and owner/profile isolation. It refetches the whole window, not just eight days.
It cannot manufacture days Oura does not supply and does not delete existing
rows just because an upstream response omits them. Return to the dashboard to
load the updated cache. A timed-out browser request may still finish on the
server: check status before repeating it.

## Backups: source is not data

A Git commit or Sites source archive is not a D1 backup and does not include
runtime secrets. Record the release SHA, applied migration names, database
identity, backup timestamp/bookmark and matching encryption-key version in a
private operator record. Keep keys in a separate secret manager. Treat even an
encrypted-token database export as sensitive: health aggregates are not encrypted
by the application's token cipher. Use an encrypted, access-controlled location
outside this public repository and outside shared/cloud-synced working folders.

For a self-hosted Cloudflare database, verify the exact target and account first.
[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
offers plan-dependent recovery windows; verify the current window and bookmark
before relying on it. A restore overwrites the database in place and interrupts
in-flight queries. Record an undo bookmark and get explicit operator approval.
Do not perform a production restore as a test.

For an independent rehearsal, follow Cloudflare's
[export/import guide](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
to export privately and import into a **new, isolated** D1 database. A raw SQLite
file must first be converted to D1-compatible SQL. Do not point the production
Worker at a rehearsal database or run a rehearsal against the production binding.

For ChatGPT Sites, the repository's publishing tools expose database inspection,
not a documented backup/restore operation. Do not assume that a previous Site
version restores data, or invent a Wrangler account/database binding. Confirm
the available recovery process and retention with the hosting operator before
an incident. If no supported backup/export is available, that is an operational
limitation; the synthetic drill below does not remove it.

## Production recovery readiness

Evidence reviewed on 2026-09-04: the [Sites guide](https://learn.chatgpt.com/docs/sites)
describes saved code versions, D1 bindings and database inspection, but does not
document database export, restore, retention or a recovery service-level
commitment. The available Sites connector exposes schema/table inspection, not
an export/restore operation. **Production database recovery is unverified, not
configured or tested by this repository.** A code rollback cannot substitute for it.

Keep this checklist in a private operator record. Do not fill it with account or
database identifiers in a public issue:

- Confirm a supported database export/restore method and the role allowed to use it.
- Verify retention and the newest usable recovery point; define acceptable data
  loss (RPO) and downtime (RTO). Do not infer Sites retention from Cloudflare plans.
- Record the exact database, release, migration set and matching encryption-key
  version. Store the key separately from the snapshot.
- Obtain an isolated rehearsal target and explicit approval before exporting
  production records. Rehearse with synthetic data first.
- Verify the restored schema, owner isolation and token decryption using counts
  only; invalidate old invitations, OAuth state and leases before restoring traffic.
- Record measured recovery time, undo plan and the person authorizing a cutover.

Questions for the hosting operator: Is a supported, private D1 export available?
Who can restore it, to which target, and with what retention? Can restoration be
rehearsed independently without modifying production? How are runtime key versions
recovered alongside the database? Until these are answered, do not promise a
recovery time or that cached data can be recovered after loss. No production
export, restore, key rotation or backup automation is part of this checklist.

## Tested offline vault verification and planned rotation

The offline tool requires Node 22.13+ and the repository's installed `tsx`.
It accepts only an existing SQLite **file**, not a SQL dump, URL, production
binding or connection string. Materialize a trusted export in a private sandbox
and apply this release's forward migrations to a separate copy first. The tool
checks SQLite integrity, foreign keys, the lease schema, and decryption of every
credential under its original owner/profile context. It does not query Oura.

Inject `OURA_RECOVERY_OLD_KEY` and, for rotation, `OURA_RECOVERY_NEW_KEY` using
your secret manager. Never put key values in command arguments, shell history,
source files, screenshots, or command output. Run from the repository root:

```bash
node --import tsx scripts/recovery/rotate-vault.mjs verify /absolute/private/snapshot.sqlite
node --import tsx scripts/recovery/rotate-vault.mjs dry-run /absolute/private/snapshot.sqlite
node --import tsx scripts/recovery/rotate-vault.mjs rotate-copy /absolute/private/snapshot.sqlite /absolute/private/rotated.sqlite
```

`verify` reads only. `dry-run` verifies re-encryption in memory and writes nothing.
`rotate-copy` publishes a new owner-readable-only file, refuses to overwrite any
existing output, leaves the source unchanged, and reports counts only. It clears
one-use OAuth states/invites and invalidates refresh leases in the new copy;
these must not be resurrected by a restore. Health rows and ownership stay intact.
This changes encryption at rest, **not** Oura access/refresh tokens themselves.

For a planned cutover, stop all writes and prevent OAuth/guest callbacks first;
an allowlist change alone does not stop already-issued guest capabilities.
Take the final private snapshot, rotate the copy, verify it with the new key,
rehearse its import against a fresh isolated database, and verify profile counts,
foreign keys, decryption and owner isolation. Only then switch the database and
runtime encryption key as one maintenance operation, deploy the verified code,
and restore traffic. Keep the matching old database/key pair for an approved
rollback window. A code-only rollback cannot undo key rotation or data changes.
Never import an older snapshot over live token rotations: its refresh tokens
may already be invalid. Reconnect affected profiles rather than retrying them
indefinitely.

If an encryption key is **lost**, old credentials cannot be decrypted: configure
a new key and reconnect each profile through normal OAuth; cached aggregates
remain. If a key or token is **exposed**, revoke affected Oura authorizations,
rotate exposed runtime secrets and reconnect. Re-encrypting stolen tokens alone
does not revoke them. On Sites without an approved database cutover path, use
this reconnect-based procedure instead of the offline import path. Remove
temporary exports securely according to the storage provider's retention policy;
deleting a local file may not erase synced versions or backups.

## Synthetic restore drill

```bash
node --import tsx --test tests/features/oura-connection/recovery-drill.test.mjs
```

This builds the actual migrated schema with two synthetic owners, credentials
and health rows. It snapshots, verifies, dry-runs, rotates into a new file and
opens that file as a restored database. Assertions cover unchanged source bytes,
file permissions, wrong-key failure without output, no output overwrite,
preserved health counts, cleared capabilities/leases, successful new-key
decryption, and failure under the old key or another owner. It is an offline
application-level rehearsal, **not evidence of a successful production D1
restore**. A provider-level rehearsal still needs a separately authorized target.
