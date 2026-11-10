# Package architecture

StackNext is a pnpm workspace. Dependencies point toward `core`; no package may
import CLI, Next.js, React, Playwright or adapter code from `core`.

## Dependency direction

```text
@stacknext/core
├── @stacknext/diagnostics
│   └── @stacknext/regression
│       └── @stacknext/playwright
├── @stacknext/next
├── @stacknext/drizzle
├── @stacknext/prisma
├── @stacknext/mcp
├── @stacknext/dashboard
└── @stacknext/cli
    ├── @stacknext/dashboard
    ├── @stacknext/diagnostics
    ├── @stacknext/mcp
    └── @stacknext/regression
```

`@stacknext/playwright` has `@playwright/test` as a peer dependency.
`@stacknext/drizzle` and `@stacknext/prisma` have their ORM clients as optional
peers. The CLI is the supported entry point; consumers should not install the
internal packages directly.

## Responsibilities

| Package | Visibility | Responsibility |
| --- | --- | --- |
| `packages/core` | Internal | Wire types and Zod schemas, redaction, normalization, config, bounded store, async transport, diagnostic wire types, snapshot storage. |
| `packages/diagnostics` | Internal | Fingerprinting, six deterministic rules, report filtering, overview and detail evidence. |
| `packages/regression` | Internal | Capture, baseline and comparison schemas, stable identities, environment snapshots, deterministic comparison, private atomic storage. |
| `packages/playwright` | Public optional | Playwright fixture, W3C trace-context injection, trace probing and sample submission. |
| `packages/next` | Public | `instrumentation.ts` registration, OpenTelemetry provider/exporter, error hook, manual span helpers. |
| `packages/drizzle` | Public optional | Drizzle `Logger` adapter. |
| `packages/prisma` | Public optional | Prisma `$on('query')` adapter. |
| `packages/mcp` | Internal | Read-only stdio MCP server, output schemas, prompts and collector API client. |
| `packages/dashboard` | Internal | React/Vite static dashboard. |
| `packages/cli` | Public | `stacknext` binary, collector HTTP server, regression and snapshot commands, dashboard host. |

`apps/example` is a private Next.js app used for real e2e and benchmark runs.
`apps/www` is the private marketing site. `apps/docs` is the public Mintlify
site. `skills/stacknext-debugging` is the canonical portable Agent Skill.

## Build topology

`pnpm -r build` follows the dependency graph:

1. `core`
2. `diagnostics`, `next`, `drizzle`, `prisma`
3. `regression`
4. `playwright`, `mcp`, `dashboard`
5. `cli`

The dashboard must build before the CLI can serve it. Do not reorder the build
around that requirement manually unless the graph changes.

Each package has two TypeScript configurations:

- `tsconfig.json` maps `@stacknext/*` to source for typechecking before a build
  exists.
- `tsconfig.build.json` sets `"paths": {}` and emits `src` to `dist`, so build
  resolution uses built `dist` types.

`tsconfig.base.json` contains strict compiler options only and no workspace
paths. Never emit `.js`, `.d.ts` or `.map` files into `src/`; output belongs in
`dist/`.

## Package boundaries

- Validate external data with Zod at the boundary.
- Instrumentation must never block a request on network I/O.
- Captured fields pass through app-side and collector-side redaction.
- Diagnostics stay deterministic, bounded and evidence-backed.
- Regression comparisons stay deterministic and report-only.
- MCP tools stay read-only, loopback-only and stable in name and arguments.
- Playwright stays optional and captured runs use one worker.

## Adding a package

1. Create `packages/<name>/` with `src`, `test`, `docs`, `package.json`,
   `tsconfig.json`, `tsconfig.build.json` and a README.
2. Add `"docs"` to `files` and include the package in the workspace build.
3. Add canonical docs under `packages/<name>/docs/` with frontmatter.
4. Add the package to `DOCUMENTED_PACKAGES` in `scripts/lib/docs.mjs` and list
   its required pages.
5. Add its generated pages to the Packages navigation in `apps/docs/docs.json`.
6. Run `pnpm docs:sync`, `pnpm check:docs`, `pnpm test:packages` and
   `pnpm test:consumer`.
7. Update the root `AGENTS.md`, the package README and the public architecture
   page if the dependency direction or user-facing surface changes.

See [documentation architecture](../development/documentation.md) for the docs
rules and [release process](../deployment/release-process.md) for publishing.

## Related

- [Architecture overview](overview.md)
- [Architecture boundaries](boundaries.md)
- [Public package architecture](../../apps/docs/architecture/packages.md)
