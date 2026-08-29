# Verification gates

## During development

Run the smallest test that proves each change, then the complete focused area:

```bash
npm run test:focus -- <area>
```

Production ownership areas are `dashboard`, `profile-management`,
`health-data`, `oura-connection`, `auth`, `database`, `security`, and `shared`.
Repository policy and tooling use `architecture`, `scripts`, or `agents`.
Run every unit and source test without building via `npm run test:unit`.

## Before integration

```bash
npm test
npm run typecheck
npm run lint
npm run check:architecture
git diff --check
```

Review the intended diff as well as command output. Source moves must preserve
behavioral assertions rather than weaken them.

## After integration

Repeat the complete gate on the exact merged `main` commit. For built-site
changes, publish only that pushed commit and follow the route checks in
`docs/sites-publishing.md`. Verification must not print health-record bodies,
credentials, tokens, or raw Oura payloads.
