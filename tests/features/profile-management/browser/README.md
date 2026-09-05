# Management browser regressions

This standalone Playwright package exercises the real client controllers and
components using synthetic responses only. It complements the existing chart
suite; it does not replace it. Application dependencies must already match the
root lockfile. Follow the repository's one-attempt installation policy.

```bash
cd tests/features/profile-management/browser
npm ci --ignore-scripts --prefer-offline --no-audit --no-fund --cache work/npm-cache
npm run install:browser
npm test
```

The fixed preview address is `http://127.0.0.1:5190`. The preview disables
operator environment loading and has no backend. The harness intercepts every
API request and blocks unrecognized routes and external hosts. Its only Oura
destination is an intercepted synthetic consent page, not an actual request.
Do not change this harness to authenticate to a live deployment.

Coverage includes sharing disclosure, expired invitations, reconnect identity,
profile/account deletion confirmation, on-demand diagnostics, confirmed history
repair, long names, keyboard focus, layout zoom, eight-profile request counts,
and deferred table rendering. The matrix includes Chromium desktop/landscape
and WebKit desktop/phone, light/dark, touch and short-height contexts.

The fixture uses vinext's actual Link shim with explicit non-secret defaults,
not the Next development server. It tests client behavior and layout; Worker
route tests separately prove authorization, no-store responses and database
isolation. It does not establish provider-level recovery or field performance.
Failure screenshots/traces in ignored `work/results` contain synthetic data
only. CI keeps them for seven days and never deploys from this workflow.

For on-demand production-built mobile lab timings, run
`node tests/features/profile-management/browser/performance.mjs` from the
repository root. See [method, baseline and budgets](../../../../docs/dashboard-performance.md).
This uses a separate loopback preview at port 5191 and does not run automatically
with `npm test` or add any production monitoring.
