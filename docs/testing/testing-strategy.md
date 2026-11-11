# Testing strategy

StackNext tests real behavior where practical. The suite has six layers; run the
full gate before declaring a change complete.

## Unit and integration

```bash
pnpm test
```

Vitest covers schemas, redaction, transport, the store, diagnostics, regression
storage and comparison, MCP output, snapshots and CLI behavior. Tests use real
transport and collector behavior where practical instead of mocking the code
under test.

## Lint, typecheck and build

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Typecheck runs per package against source paths; the build emits `dist` and is
required before e2e or benchmark runs. Do not emit `.js`, `.d.ts` or `.map`
files into `src`.

## End-to-end

```bash
pnpm build
pnpm test:e2e
```

The e2e script starts the CLI, collector, example app, dashboard, MCP server and
regression flow. It reuses a live runtime if one exists. It covers capture →
baseline → candidate → compare, regression APIs, CLI records, snapshot
operations, MCP tools and dashboard deep links.

Warm `/`, `/projects/1` and `/api/n-plus-one` before a baseline capture. Cold
route-module spans can appear on only one side and make a comparison
inconclusive. Use one Playwright worker and at least three samples.

## Package archives

```bash
pnpm test:packages
pnpm test:consumer
```

`test:packages` builds tarballs, inspects their contents and validates required
docs, the CLI skill, exports, permissions and absent secrets. `test:consumer`
checks the installed-consumer path. Do not publish or push from these checks.

## Documentation

```bash
pnpm check:docs
```

This verifies the generated CLI package index is current, navigation targets and
redirects resolve, frontmatter exists, package `files` include `docs`, links
work, required package documentation is present and the website changelog is
current. See [documentation architecture](../development/documentation.md).

## User-facing verification

For changes that affect runtime behavior, start the example app and check the
dashboard pages, CLI commands, MCP tools and redaction-sensitive output. Cover:

- Overview coverage and diagnostics cards;
- request/trace timelines and database/error views;
- `/diagnostics`, `/diagnostics/:id`;
- `/runs`, `/baselines`, `/comparisons` and their detail pages;
- `/snapshots` and its scoped trace/error/database views;
- `/actions-demo`, `/api/custom-work`, `/api/n-plus-one`,
  `/api/n-plus-one-fixed`, `/api/slow-db` and `/api/repeated-fetch`;
- `stacknext coverage`, `diagnose`, `capture`, `runs`, `baseline`, `compare`
  and `snapshot`;
- MCP summary, diagnostics, regression and snapshot tools.

## Redaction verification

If captured data changed, verify the example error route still redacts
`demo-url-secret`, `super-secret-demo-token` and `hunter2`, that action and
custom-span attributes do not leak `action-attribute-secret`,
`custom-attribute-secret`, `custom-url-secret` or `e2e-url-secret`, and that
diagnostic evidence, regression records, comparisons, snapshots and export
output do not contain those values either.

Also check that explicit `NEXT_OTEL_VERBOSE=0` still overrides
`instrumentation.verbose: true`, and that `NEXT_OTEL_VERBOSE=1` is reported with
its performance caveat.

## Test selection

| Change | Required checks |
| --- | --- |
| Schema, redaction, normalization | `pnpm test`, `pnpm check:docs`, secret-leak tests |
| CLI or collector | `pnpm test`, `pnpm test:e2e` |
| Dashboard route or deep link | `pnpm test`, `pnpm test:e2e`, manual dashboard check |
| MCP tool, prompt or output schema | `pnpm test`, `pnpm test:e2e`, `pnpm test:packages` |
| Regression or snapshot storage | `pnpm test`, `pnpm test:e2e`, `pnpm test:packages` |
| Package metadata, exports or build | `pnpm build`, `pnpm test:packages`, `pnpm test:consumer` |
| Docs, navigation or changelog | `pnpm check:docs`, Mintlify validate/broken-links |
| Performance-sensitive runtime code | `pnpm benchmark`, `pnpm benchmark:diagnostics`, `pnpm benchmark:verbose` |
| Dashboard refresh, rendering or bundle behavior | `pnpm benchmark:dashboard`, `pnpm test:e2e` |

## Related

- [Development environment](../development/environment-setup.md)
- [Release process](../deployment/release-process.md)
- [Agent compatibility](agent-compatibility.md)
- [Benchmarks](benchmarks.md)
