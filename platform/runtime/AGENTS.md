# Runtime platform instructions

Read the root `AGENTS.md` first. This area may depend only on other `platform/`
or `shared/` modules and must never import a product feature.

Runtime bindings are server-only. Never print, serialize, or expose environment
values; public responses may describe configuration presence only.

Focused check: `npm run typecheck`.
