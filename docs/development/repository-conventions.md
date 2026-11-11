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

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) for every
commit and pull request title:

```text
<type>(<scope>)!: <imperative summary>
```

- Allowed types: `feat`, `fix`, `perf`, `revert`, `docs`, `test`, `chore`,
  `ci`, `build` and `refactor`.
- Scope is optional but preferred. Use a package or area, for example `cli`,
  `core`, `dashboard`, `docs`, `release` or `www`.
- Use the imperative mood, lowercase after the colon, no trailing period and a
  subject of 72 characters or fewer.
- Mark incompatible changes with `!` before the colon or a
  `BREAKING CHANGE:` footer.
- The release planner reads the first line. `feat` requests a minor bump;
  `fix`, `perf` and `revert` request a patch; the other types do not release on
  their own. `Release-As: x.y.z` forces an exact version. See the
  [release process](../deployment/release-process.md#bump-rules).

Examples:

```text
feat(cli): add snapshot export command
fix(core): keep redacted query values out of exports
docs(agents): point contributors at the testing matrix
chore(release): 0.13.0
```

## Pull requests

`main` uses squash merge, so the pull request title becomes the commit the
release planner reads. Make the title a valid Conventional Commit even when the
branch commits are not.

- Keep the diff focused. Do not mix a refactor with a behavior change unless
  the refactor is required for the behavior.
- Fill [the pull request template](../../.github/pull_request_template.md) and
  keep every section accurate.
- List the exact commands and results. Do not write "tests pass" without naming
  the suite. State which checks could not run and why.
- Include tests for new behavior and regression tests for fixes.
- Link the issue when one exists and call out breaking, privacy, compatibility
  and release implications.
- Do not include generated output, logs, local databases, tokens or captured
  data.

## API and schema changes

- Wire types and validation live in `packages/core/src/schema.ts`.
- Diagnostic wire types live in `packages/core/src/diagnostics.ts`.
- Regression schemas live in `packages/regression/src/`.
- MCP tool names, arguments and output schemas are a compatibility surface.
  Add metadata rather than renaming or removing fields.
- A captured field is not complete until both redaction layers and the privacy
  docs are updated.

## Compatibility surfaces

These are consumed by users, clients or saved records. Change them additively
unless a major version is explicitly planned:

- CLI command names, flags, JSON shapes and exit codes.
- MCP tool names, argument schemas and read-only annotations. Response metadata
  and output fields may be added.
- Documented package entry points and TypeScript declarations.
  `@stacknext/core` has subpath exports for transport, config-file and
  snapshots.
- Wire and storage formats. Bump the format or engine version when a schema
  changes; keep old records readable or report them as invalid.
- `stacknext.config.json` fields. Add optional fields with defaults; do not
  reinterpret existing values.
- Public documentation URLs. Add a redirect in `apps/docs/docs.json` when a
  page moves.

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
