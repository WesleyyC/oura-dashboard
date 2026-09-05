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

Also run `npm audit`: its current advisory inventory can differ from GitHub's
repository alerts. That second check identified two additional compatible fixes:
`react-server-dom-webpack` 19.2.8 for
[GHSA-wx67-qw84-cm4g](https://github.com/advisories/GHSA-wx67-qw84-cm4g), matching the
existing React/React DOM 19.2.8 release, and `fflate` 0.7.5 for
[GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98).
Both are included in this release; a development-dependency label does not mean
that React server-component code is absent from a production bundle.

## Known residual build-tool advisory

As checked on 2026-09-04, `image-size` 2.0.2 is still the latest published release
and is affected by parser denial-of-service advisories
[GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and
[GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
It is pinned by vinext 0.0.50. npm therefore reports both `image-size` and its
parent `vinext`; this is **not a zero-advisory dependency tree**.

Inspection of this vinext release found the parser in build-time local image
imports and static metadata generation. No `image-size` import or `imageSize`
call was found in the resulting Worker JavaScript. This limits the observed
exposure to tooling; it is not a blanket proof that the package is safe. Review
image assets before building untrusted contributions, keep CI time limits, and
do not add user-supplied image parsing using this package.

The audit's suggested replacement is a major/pre-release vinext migration, not
an image-size patch. Keep this risk visible rather than silently suppressing it
or running `npm audit fix --force`. Reassess with a stable patched dependency or
a separately tested framework migration; re-check deployed bundle reachability
when the build pipeline or image features change.
