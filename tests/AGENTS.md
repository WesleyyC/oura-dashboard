# Test instructions

Read the root `AGENTS.md` first. Tests mirror production ownership under
`tests/features/`, `tests/platform/`, `tests/shared/`, `tests/architecture/`,
and `tests/scripts/`. Put new coverage beside the area that owns the behavior.

Before moving or changing production code, add focused characterization here
and confirm it fails for the intended reason. Keep behavioral and source-boundary
assertions exact when ownership paths change; do not weaken them to make a move
pass. Run the focused area during development and the complete gate before
integration.

Focused command: `npm run test:focus -- <area>`. Complete unit command:
`npm run test:unit`.
