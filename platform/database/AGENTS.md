# Database platform instructions

Read the root `AGENTS.md` first. This area owns D1/Drizzle setup and schema
definitions. It must never import a product feature or expose database bindings
through a browser-safe entrypoint.

Do not regenerate, rewrite, or delete migrations during structural refactors.
Preserve table names, columns, indexes, keys, and D1 binding behavior exactly.

Focused check: `npm run test:focus -- database`.
