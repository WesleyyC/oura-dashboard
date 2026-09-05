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
