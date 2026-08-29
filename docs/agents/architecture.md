# Architecture boundaries

The target layout separates framework adapters, product features,
infrastructure, and reusable primitives:

```text
app/       Next.js pages and route adapters
features/  product capabilities with explicit client and server entrypoints
platform/  authentication, database, runtime, and security infrastructure
shared/    product-independent UI and async primitives
```

## Dependency direction

- `app/` may consume public feature, platform, and shared entrypoints.
- A feature may consume shared code and server-side platform entrypoints.
- Cross-feature imports use the target feature's `client.ts` or `server.ts`.
- `platform/` never imports a feature.
- `shared/` never imports a feature or platform module.
- `client.ts` never reaches D1, secrets, token records, OAuth repositories, or
  another `server.ts`.

Keep framework parsing in `app/`, product rules in features, infrastructure in
platform modules, and only genuinely reusable primitives in shared modules.
Run `npm run check:architecture` after changing an import boundary.

Feature internals follow the same ownership vocabulary: browser HTTP adapters
live in `client/`, server persistence and integration code in `server/`, pure
rules in `domain/` or `model/`, and JSX in `components/`. Pages and routes
consume only the public `client.ts` or `server.ts` entrypoint; they do not reach
into those internal directories.

The check scans static imports, literal dynamic imports, and active agent
instructions. It reports only paths, line numbers, and stable rule codes.
Historical execution records under `docs/superpowers/` are not active
instructions.
