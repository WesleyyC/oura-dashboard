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

For chart or dashboard layout/interaction changes, also run the synthetic
[browser regressions](../../tests/features/dashboard/browser/README.md). Their
test-only dependency package is separate from the application's dependencies;
the Node test runner skips nested dependency and generated `work` directories.

## Before integration

```bash
npm test
npm run typecheck
npm run lint
npm run check:architecture
git diff --check
```

For dashboard changes, after installing the browser test dependencies:

```bash
npm --prefix tests/features/dashboard/browser test
```

This suite also runs in the separate `Browser regressions` GitHub workflow on
pull requests and pushes to `main`. CI validates only; it does not deploy.

For Settings, connection flows, recovery UI, or controller-loading changes, also
run the [management browser suite](../../tests/features/profile-management/browser/README.md):

```bash
npm --prefix tests/features/profile-management/browser test
```

Its separate `Management browser regressions` workflow covers Chromium and
WebKit using synthetic APIs. Require `management-browser-tests` alongside
`verify` and `browser-tests` when this workflow is installed on a protected repo.
Run both browser suites for a release that changes shared UI or dashboard loading.

Review the intended diff as well as command output. Source moves must preserve
behavioral assertions rather than weaken them.

## After integration

Repeat the complete gate on the exact merged `main` commit. For built-site
changes, publish only that pushed commit and follow the route checks in
`docs/sites-publishing.md`. Verification must not print health-record bodies,
credentials, tokens, or raw Oura payloads.
