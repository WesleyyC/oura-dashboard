# Health-data instructions

Read the root `AGENTS.md` first. Browser code imports only `client.ts`; server
code imports `server.ts`. Other features must not reach into internal domain or
repository directories.

This feature stores aggregate daily Oura metrics only. Preserve inclusive date
ranges, missing-value semantics, zero-workout semantics, owner/profile
isolation, and the no-Google-Calendar boundary. Never log or return raw health
records outside the existing authenticated API contract.

Focused check: `npm run test:focus -- health-data`.
