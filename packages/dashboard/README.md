# @stacknext/dashboard

Static React dashboard served by the [StackNext](https://github.com/marrrkkk/stacknext)
local collector.

This package is a runtime dependency of the `@stacknext/cli` CLI. Applications
should install the CLI rather than use this package directly:

```bash
npm install --save-dev @stacknext/cli @stacknext/next
npx stacknext dev
```

The dashboard is in-memory, loopback-only and receives already-redacted
telemetry from the collector. It is not a hosted service and has no runtime
exports other than `./package.json`.

## Views

- Overview: counts, latency, recent errors, coverage and top diagnostics.
- Requests and request detail.
- Traces and trace waterfall.
- Database queries.
- Errors and error detail.
- Diagnostics list and detail.
- Runs, baselines and comparisons, including deep links.
- Snapshots, including scoped traces, errors and database queries.
- Settings and MCP setup.

Routes and deep links are documented in [docs/routes.md](docs/routes.md).

## Development

```bash
pnpm --filter @stacknext/dashboard dev
pnpm --filter @stacknext/dashboard build
pnpm --filter @stacknext/dashboard typecheck
```

The dev server uses Vite. The built `dist` is served by the CLI collector; the
dashboard must build before the CLI can serve it. See
[docs/development.md](docs/development.md) for the shell, design tokens and
testing notes.

## Documentation and AI agents

- [Package overview](docs/index.md)
- [Routes](docs/routes.md)
- [Development](docs/development.md)

The package docs ship in the npm archive. User-facing guides live on the
[documentation site](https://github.com/marrrkkk/stacknext/tree/main/apps/docs).
Agents changing a route should read the package docs and the repository
[dashboard layout specification](https://github.com/marrrkkk/stacknext/blob/main/docs/architecture/dashboard-layout.md).

License: MIT.
