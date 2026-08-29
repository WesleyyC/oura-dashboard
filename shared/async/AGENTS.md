# Shared async instructions

Read the root `AGENTS.md` first. Shared code must remain independent of
`features/` and `platform/` and must not contain product-specific behavior.

Keep concurrency utilities deterministic, bounded, order-preserving, and free
of logging that could expose worker inputs.

Focused check: `npm run test:focus -- shared`.
