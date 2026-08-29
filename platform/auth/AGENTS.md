# Authentication platform instructions

Read the root `AGENTS.md` first. This area may depend only on other `platform/`
or `shared/` modules and must never import a product feature.

Keep identity server-derived. Never log authenticated headers, owner emails, or
allow-list values. Preserve private, stable authentication error responses.

Focused check: `npm run test:focus -- auth`.
