# Dashboard loading budgets

These are deterministic synthetic regression budgets, not field measurements
of LCP, INP, bandwidth or user-perceived latency.

| Scenario | Before | Current budget |
| --- | --- | --- |
| Eight fresh profiles, initial individual view | 16 health-cache requests (recent + history for everyone) | 2 for the selected person; other histories load when their view is requested |
| Hidden tab | Clock/cache polling continues | No periodic cache requests; visibility return catches up |
| Two parallel refreshes | Fast result waits for its slower peer | Each profile updates as soon as its own refresh completes |
| Collapsed 180-day details | 180 data rows, 3,420 data cells mounted | No data rows/cells until opened; all return on expansion |

The cache hook owns request deduplication, cancellation, version protection and
coverage merging. The controller coordinates view/range changes, visible cache
loads and automatic refresh decisions. The seven-day cache renders first;
six-month history follows without blocking it. Family still loads every person's
requested range, with concurrency limited to two. Automatic refresh still checks
all stale connected profiles, selected person first; deferred cache loading does
not change the refresh policy.

Regression coverage lives in `tests/features/dashboard/dashboard-loading.test.mjs`
and `dashboard-api.test.mjs`: slow peers, late responses, reinitialization, failed
list retry, history errors, device-time-zone boundaries and bounded HTTP reads.
Family-view code and the daily detail table load on demand; the collapsed detail
table does not mount its rows. Accessible chart tables and keyboard date selection
remain available. Avoid turning these reductions into latency
claims without measuring an equivalent synthetic browser session or consented
field telemetry. No analytics or health-data telemetry was added.

## On-demand mobile lab baseline

After installing the management browser package and Chromium as described in its
[README](../tests/features/profile-management/browser/README.md), run:

```bash
node tests/features/profile-management/browser/performance.mjs
```

This builds the real dashboard client/controller with production React and Vite,
serves it on loopback, and supplies eight fictional profiles and 185 generated
days. It never reads environment files, authenticates, or reaches a live backend;
external and non-GET requests fail the run. No runtime telemetry is added.
Five fresh browser contexts use a 390×844 viewport, 4× CPU throttling and
1.6 Mbps / 100 ms asset networking. Intercepted synthetic API responses have a
separate 100 ms delay; they do not model backend work or API bandwidth.

Measured 2026-09-04 on macOS arm64, Node 22.18.0, Chromium 153.0.8010.12:

| Measurement | Median | Maximum of five | Median regression ceiling |
| --- | ---: | ---: | ---: |
| Navigation to four interactive charts | 1,601 ms | 1,616 ms | 4,000 ms |
| Cached six-month range change | 89 ms | 101 ms | 300 ms |
| Synchronized keyboard date selection | 20 ms | 34 ms | 150 ms |
| Open 185-row daily details | 239 ms | 245 ms | 750 ms |

Initial timing starts at browser navigation. Interaction timing starts at the
actual DOM input event, ends when the expected semantic DOM state is present,
and includes two animation frames. It is a lab readiness/interaction proxy, not
LCP or INP, and excludes production SSR, authentication and database/API latency.
CPU throttling on a desktop is not a substitute for a physical low-end phone.
The small sample reports its maximum, not a statistically meaningful p95.

The command enforces the two-request initial budget, deferred detail rows, no
browser errors, synchronized selection, and the generous median ceilings above.
It writes timings only to ignored `work/performance/report.json` beside the
browser package, including browser/runtime versions and all five samples.
Run it on demand for relevant releases, on an otherwise idle machine. Investigate
a failure and compare equivalent runs; do not raise ceilings just to get green.
The measurements do not justify a chart rewrite or a user-facing speed claim.
