# @stacknext/core

Core wire types, Zod schemas, redaction, configuration, framework span metadata,
bounded in-memory storage, async transport and snapshot storage for
[StackNext](https://github.com/marrrkkk/stacknext).

This package is the shared foundation for the StackNext CLI, adapters and app
instrumentation. Most applications should install `@stacknext/cli` and
`@stacknext/next` instead of depending on this package directly.

```bash
npm install --save-dev @stacknext/cli @stacknext/next
npx stacknext init
npx stacknext dev
```

## Entry points

| Import | Contents |
| --- | --- |
| `@stacknext/core` | Wire types, Zod schemas, redaction, normalization, bounded store, framework span allowlist, coverage, diagnostic wire types, config, verbose status. |
| `@stacknext/core/transport` | Process-wide bounded transport, environment resolution and loopback validation. |
| `@stacknext/core/config-file` | `stacknext.config.json` path, reading and loading with Zod validation. |
| `@stacknext/core/snapshots` | Snapshot payloads, atomic local storage, listing, import/export and detached read views. |
| `@stacknext/core/package.json` | Installed version metadata. |

## Package boundary

`core` is the base of the dependency graph. It must not import CLI, Next.js,
React, Playwright or adapter code. It validates external data at the boundary,
performs both redaction layers' shared primitives, and never performs network
I/O unless a loopback collector URL and token are supplied.

## Documentation

- [Package overview](docs/index.md)
- [Wire schemas](docs/schemas.md)
- [Transport](docs/transport.md)
- [Redaction](docs/redaction.md)
- [Configuration](docs/configuration.md)
- [Snapshots](docs/snapshots.md)

The `docs/` directory ships in the npm archive and matches the installed
version. Public concepts live on the
[documentation site](https://github.com/marrrkkk/stacknext/tree/main/apps/docs).

## AI agents

Agents should read `docs/index.md` and the focused package pages from the
installed archive before changing wire fields, limits or redaction. The package
does not call a model and does not expose an MCP surface; the read-only server
is in `@stacknext/mcp`.

## Development

```bash
pnpm --filter @stacknext/core build
pnpm --filter @stacknext/core typecheck
pnpm test
```

This package is ESM-only, requires Node.js 20.9 or newer and is published as an
internal dependency of the StackNext CLI and integrations.

License: MIT.
