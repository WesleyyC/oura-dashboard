# Oura-connection instructions

Read the root `AGENTS.md` first. Browser code imports only `client.ts`; server
routes and scripts import only `server.ts`. Other features must not reach into
this feature's internal directories.

Never expose or log client secrets, authorization codes, OAuth state, invite
capabilities, access/refresh tokens, encrypted token records, raw Oura
responses, or Oura payloads. Preserve scopes, inclusive caller ranges, endpoint
normalization, single-use capabilities, safe errors, leases, and per-profile
reauthorization isolation.

Focused check: `npm run test:focus -- oura-connection`.
