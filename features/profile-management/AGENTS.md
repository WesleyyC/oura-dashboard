# Profile-management instructions

Read the root `AGENTS.md` first. Browser code imports only `client.ts`; server
routes and features import only `server.ts`. Other features must not reach into
this feature's internal directories.

Owner identity is always trusted server input. Keep every operation scoped by
owner plus profile, never accept credentials in browser payloads, and never
expose token or configuration values. Keep browser HTTP details in `client/`,
deterministic state in `model/`, and rendering in `components/`. Preserve the
two-profile refresh limit, reorder rollback, handoff polling, confirmation
behavior, rendered copy, and CSS selectors.

Focused check: `npm run test:focus -- profile-management`.
