# Dependency maintenance

Use focused updates against current `main`, not an old bot branch's green checks.
Run the exact-dependency check, full build/unit gate, and both browser suites.
Keep the three required GitHub checks and pull-request protection enabled.
Do not dismiss an advisory merely because it is a development dependency.

The 2026-09-04 readiness update includes Browserslist 4.28.9 and Babel core 7.29.7
from the focused bot proposals, addressing
[GHSA-73wf-gq98-2v4g](https://github.com/browserslist/browserslist/security/advisories/GHSA-73wf-gq98-2v4g)
and [GHSA-4x5r-pxfx-6jf8](https://github.com/babel/babel/security/advisories/GHSA-4x5r-pxfx-6jf8).

Drizzle Kit 0.31.10 still brings in the deprecated `@esbuild-kit/core-utils`
loader, whose esbuild 0.18 dependency is affected by
[GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).
A scoped npm override selects esbuild 0.25.12 for this loader only. It does not
upgrade the application framework or change Drizzle's schema. Remove the override
when a tested upstream Drizzle release removes or fixes the transitive dependency.
Do not broaden it into a global esbuild override.

Verification includes the lockfile security regression, actual Drizzle schema
generation into a temporary directory, a clean install, and the app/browser gates.
The initial rehearsal also checked synchronous/asynchronous TypeScript transforms
through the real loader and confirmed its esbuild server did not permit wildcard
cross-origin reads. Never expose a development server publicly.

When inspecting GitHub alerts via the CLI, paginate the API response. A first
page is not the complete alert inventory. GitHub may take time to rescan after
merge; report the live alert state separately from a patched lockfile.
