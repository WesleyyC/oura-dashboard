# Dashboard browser regressions

These tests render the real dashboard components and stylesheet with generated,
fictional Alex/Blair records. They never mount the network controller, load
environment files, authenticate, or read an Oura account. The preview binds only
to `127.0.0.1`; the tests reject API and external HTTP requests.

From a checkout with the exact application dependencies installed:

```bash
npm ci --prefix tests/features/dashboard/browser --ignore-scripts --prefer-offline --no-audit --no-fund --cache work/npm-cache
npm --prefix tests/features/dashboard/browser run install:browser
npm --prefix tests/features/dashboard/browser test
```

On Linux, append `-- --with-deps` to `install:browser` to install Chromium's
system libraries. Follow the repository's worktree and npm-installation policies.
Playwright is pinned in this separate test-only package; when updating it, update
its lockfile and installed browser together. Root dependency updates do not update
this package automatically.

Coverage includes synchronized pointer/touch/keyboard selection, keyboard-only
focus rings, range/person resets, axis-to-grid alignment, 12px minimum axis text,
narrow-screen overflow, empty/loading states, missing-data gaps, and partial
Family loading. Chromium runs five desktop/phone/landscape configurations,
including light and dark appearance and reduced motion.

`work/results` contains panel captures plus screenshots/traces on failure. CI
retains failure artifacts for seven days. Everything in those artifacts is
fictional. Successful panel captures are review aids, not committed pixel-golden
tests: cross-platform font rasterization should not invalidate the suite.

For before/after comparisons, set `BROWSER_TEST_OUTPUT_DIR=work/before` (or
`work/after`) and run `npm test -- --grep 'axes align'` from this directory.
For manual inspection, run the `preview` script and open the printed local URL;
stop it before running tests, which intentionally require their own server.

This component fixture is not a production route or a replacement for the
existing auth/API tests and deployed route checks. It does not test OAuth,
real-user data loading, WebKit/Safari, or Firefox.
