# Feature map

| Area | Owns | Does not own | Focused verification |
| --- | --- | --- | --- |
| `features/dashboard/` | dashboard loading, range/view state, charts, family and individual presentation | profile persistence, Oura tokens | `npm run test:focus -- dashboard` |
| `features/profile-management/` | profile identity, settings workflows, profile persistence | health aggregates, Oura API transport | `npm run test:focus -- profile-management` |
| `features/health-data/` | aggregate contracts, validation, analysis, storage | credentials, OAuth | `npm run test:focus -- health-data` |
| `features/oura-connection/` | Oura client, OAuth, invites, tokens, collection, refresh | owner authentication, dashboard rendering | `npm run test:focus -- oura-connection` |
| `platform/auth/` | owner authentication and allowlisting | product behavior | `npm run test:focus -- auth` |
| `platform/database/` | D1/Drizzle schema and migrations | product behavior | `npm run test:focus -- database` |
| `platform/security/` | headers and rate limiting | product behavior | `npm run test:focus -- security` |
| `platform/runtime/` | hosted runtime bindings | product behavior | `npm run test:focus -- architecture` |
| `shared/` | product-independent UI and concurrency | persistence and feature state | `npm run test:focus -- shared` |

Before changing a feature, read its nested `AGENTS.md`, inspect public
entrypoints, and use `node scripts/agents/status.mjs` to find exact-file overlap.
If two live branches touch the same file, coordinate rather than overwrite.
