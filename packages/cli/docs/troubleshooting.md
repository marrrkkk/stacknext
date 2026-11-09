---
title: Troubleshooting
description: Fix missing telemetry, port conflicts, stale runtime state, MCP and agent setup problems.
---

# Troubleshooting

## Start with doctor

```bash
stacknext doctor
stacknext doctor --json
```

It checks Node.js, Next.js, the App Router, configuration, instrumentation,
adapters, dashboard build, runtime file permissions and collector health. It
exits `1` when a check fails.

## Dashboard is empty

1. Confirm you started the app with `stacknext dev`, not `next dev`.
2. Make a request after the app is ready.
3. Run `stacknext status --json` and check `runtime` and `connections`.
4. Run `stacknext coverage`. `active` means connected but not exercised;
   `configured` means no app is connected.
5. Inspect `instrumentation.ts` and the app logs with `STACKNEXT_DEBUG=1`.

## Port already in use

The dashboard prefers 4400 and tries the next 25 ports. Check the URL printed by
`stacknext dev`. The example app uses 4402 by default. Stop orphaned `next dev`
processes on ports 4400–4425 before restarting.

## Stale `.stacknext/run.json`

If `stacknext dev` crashes or is killed, `doctor` reports a stale pid. Restart
`stacknext dev`; it replaces the state. Do not reuse or share the token.

## Stop the server cleanly

Send SIGINT or SIGTERM to `stacknext dev`. It closes the collector, stops the
app child and removes `.stacknext/run.json`. `SIGKILL` skips cleanup and can
leave the state file behind.

## MCP client cannot connect

- Start `stacknext dev` before the client starts the server.
- Run `stacknext mcp` from the app directory, or pass `--collector` and
  `--token`.
- Ensure stdout is not mixed with logs. The server writes logs to stderr.
- Check that the collector URL is loopback. Remote URLs are rejected.
- Restart the client after changing its MCP configuration.

## `stacknext init --agents` fails

- If `AGENTS.md` contains only one of the two markers, the command refuses to
  guess and leaves the file unchanged. Restore or remove the partial block.
- Check file permissions.
- `--skip-agents` skips the operation; it is the default when `--agents` is not
  passed.

## Skill installation refuses to overwrite

The destination already exists. Review it, then use `--force` to replace it, or
choose another project directory with `--dir`.

## Capture exits 3

The test command succeeded but telemetry correlation is incomplete. Inspect
`stacknext runs show <run-id> --json` and the sample reasons. Do not interpret
the run as a pass. See
`node_modules/@stacknext/playwright/docs/troubleshooting.md`.

## Verbose tracing is slower

`NEXT_OTEL_VERBOSE=1` adds spans and dev-server work. Use it for short
investigations, not permanently. Set `NEXT_OTEL_VERBOSE=0` to override
`instrumentation.verbose: true`.

## Package versions do not match

Run `stacknext --version` and compare all `@stacknext/*` entries in the lockfile.
All ten packages are released at one version. Mismatched versions are
unsupported.
