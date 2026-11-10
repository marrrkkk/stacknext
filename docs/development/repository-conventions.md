# Repository conventions

The root [`AGENTS.md`](../../AGENTS.md) is the review contract. This page adds
the implementation detail that is easy to miss when changing the workspace.

## Source layout

```text
packages/*/src        TypeScript sources
packages/*/test       Vitest tests
packages/*/docs       canonical package documentation
apps/example          real Next.js app for e2e and benchmarks
apps/www              private marketing site
apps/docs             public Mintlify site
docs/                 contributor and engineering knowledge base
scripts/              real e2e, benchmark, docs and release tooling
skills/               canonical portable Agent Skill
```

Keep test fixtures close to the package that owns them. Do not add a new
top-level directory for a one-off script; put it under `scripts/` and document
it in [scripts and tooling](../tooling/scripts.md).

## Build and typecheck layout

- `tsconfig.base.json` contains strict compiler options only and **no**
  workspace `paths`.
- Package `tsconfig.json` files map `@stacknext/*` to source for typechecking
  before a build exists.
- Package `tsconfig.build.json` files set `"paths": {}` and emit `src` to
  `dist`. Build-time resolution must use built `dist` types, never source.
- This split exists because Turbopack otherwise bundles `packages/next/src` and
  fails on `./exporter.js` imports.
- Never emit `.js`, `.d.ts` or `.map` files into `src/`. If they appear, delete
  them; output belongs in `dist/`.
- `pnpm -r build` handles topology (`core` before dependents, `dashboard`
  before `cli` serves it). Do not reorder around it manually unless necessary.

## Code style

- TypeScript strict mode, ESM, `.js` extensions in relative imports.
- Keep dependencies minimal and justified. Prefer Node built-ins and existing
  packages.
- Match surrounding naming and structure. Avoid `any`; validate external data
  with Zod and use the inferred types.
- Tests should exercise real behavior (real transport/collector where
  practical), not mocks of the code under test.
- No generated build output, logs, local databases or runtime state in commits.

## API and schema changes

- Wire types and validation live in `packages/core/src/schema.ts`.
- Diagnostic wire types live in `packages/core/src/diagnostics.ts`.
- Regression schemas live in `packages/regression/src/`.
- MCP tool names, arguments and output schemas are a compatibility surface.
  Add metadata rather than renaming or removing fields.
- A captured field is not complete until both redaction layers and the privacy
  docs are updated.

## Package metadata

- Every published package has `files: ["dist", "docs"]`, `exports`, `types`,
  `license` and repository metadata.
- Published packages share one version.
- `workspace:*` dependencies are rewritten by `pnpm pack`; never publish a
  workspace range.
- `pnpm test:packages` inspects the real archives and is the source of truth for
  archive completeness.

## Change discipline

- Keep the diff focused. Do not mix a refactor with a behavior change unless
  the refactor is required for the behavior.
- Preserve existing instrumentation files, middleware, proxy and
  `next.config`.
- Do not add a cloud service, outbound telemetry, automatic source edits or an
  LLM provider.
- Record user-visible changes in `CHANGELOG.md` and regenerate the website data
  with `pnpm changelog:sync`.

## Related

- [Development environment](environment-setup.md)
- [Documentation architecture](documentation.md)
- [Testing strategy](../testing/testing-strategy.md)
- [Architecture boundaries](../architecture/boundaries.md)
