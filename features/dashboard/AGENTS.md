# Dashboard instructions

Read the root `AGENTS.md` first. Browser consumers import only `client.ts`;
other features must not import this feature's internal directories. Keep HTTP
details in `client/`, deterministic transitions in `model/`, display helpers in
`presentation/`, and JSX in `components/`.

The dashboard may consume only browser-safe feature entrypoints, shared helpers,
and shared UI. Preserve URL selection, cache polling, Oura refresh concurrency,
partial-failure behavior, rendered copy, CSS selectors, semantic HTML, and
keyboard behavior.

Focused check: `npm run test:focus -- dashboard`.
