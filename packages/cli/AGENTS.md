# AGENTS.md — @stacknext/cli

Scope: the `stacknext` binary, collector and dashboard host. Read the root
[`AGENTS.md`](../../AGENTS.md) first; repository-wide rules still apply.

## What this package owns

- `src/bin.ts` and `src/program.ts`: command registration and exit codes.
- `src/commands/`: `init`, `dev`, `status`, `doctor`, `coverage`, `diagnose`,
  `export`, `mcp`, `skill`, `capture`, `runs`, `baseline`, `compare`,
  `snapshot` and `uninstall`.
- `src/collector/server.ts`: loopback HTTP server, auth, ingest validation,
  read APIs, SSE, static dashboard assets and security headers.
- `src/runtime.ts` / `src/project.ts`: `.stacknext/run.json`, project config and
  runtime discovery.
- `src/agents.ts`: the managed consumer `AGENTS.md` block.

## Invariants

- Bind to `127.0.0.1`/`localhost` and reject other hosts. Ingestion requires
  the bearer token; read APIs and SSE accept the bearer token or the dashboard
  session cookie. Keep Host, Origin and `Sec-Fetch-Site` checks, CSP and
  security headers intact.
- Validate every ingest envelope with Zod, cap the body size and bound counts
  before storage. Redact and normalize again before the store.
- `init` never overwrites `instrumentation.ts`, middleware, proxy or
  `next.config`; it prints manual instructions instead.
- `dev` writes `.stacknext/run.json` with mode `0600` and removes it on
  graceful shutdown. Stop with SIGINT/SIGTERM. Do not log or commit tokens.
- Keep documented command names, flags, JSON shapes and exit codes stable. Add
  fields rather than renaming or removing them.
- Regression and snapshot commands are the only writers of those records.
  Follow the storage, overwrite and `--fail-on` rules in the root `AGENTS.md`.
- Do not add a managed container runtime, `runtime.mode`, `--docker`/`--native`
  flags or a `stop` command.
- The dashboard must build before the CLI can serve it.

## Verification

```bash
pnpm --filter @stacknext/cli typecheck
pnpm exec vitest run packages/cli/test
pnpm test
pnpm build
pnpm test:e2e
pnpm test:packages
```

Update `docs/commands.md`, `docs/configuration.md` or `docs/skill.md` when the
surface changes. `docs/packages.md` and the CLI's copied skill are generated;
never edit them by hand.
