# Security platform instructions

Read the root `AGENTS.md` first. This area may depend only on other `platform/`
or `shared/` modules and must never import a product feature.

Preserve fail-closed policy, private responses, keyed actor digests, security
headers, and fixed rate-limit windows. Never log actor or key material.

Focused check: `npm run test:focus -- security`.
