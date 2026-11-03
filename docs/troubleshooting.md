# Troubleshooting

Start with:

```bash
npx stacknext doctor
npx stacknext doctor --json
```

`doctor` checks the runtime state, collector connection, instrumentation file,
config, package versions and app process. It does not prove that a particular
feature was exercised; use `stacknext coverage` and the dashboard sample window
for that.

## Installation and initialization

### `stacknext: command not found`

Install the CLI in the app package and run it through the package manager:

```bash
npm install --save-dev @stacknext/cli @stacknext/next
npx stacknext --version
```

With pnpm, use `pnpm exec stacknext --version`. Global installation is not
required or recommended.

### `init` says the Next.js dependency was not found

Run `init` from the directory that contains the app's `package.json`. In a
monorepo, the Next.js dependency is usually in the app package, not the workspace
root.

Check:

```bash
node -p "require('./package.json').dependencies.next"
```

### `init` says the App Router directory was not found

StackNext supports `app/` and `src/app/`. The Pages Router (`pages/`) is not
supported. Create or move the app under the App Router before installing.

### `init` left my instrumentation file alone

That is intentional. If `instrumentation.ts`, `.js`, `.mjs`, `.tsx` or `.jsx`
already exists, StackNext never overwrites it. Add the printed hook manually:

```ts
import {
  registerStackNext,
  onRequestError as stackNextOnRequestError,
} from '@stacknext/next'

export async function register() {
  await registerStackNext()
}

export const onRequestError = stackNextOnRequestError
```

If the file already exports `onRequestError`, call `stackNextOnRequestError`
inside it instead of redeclaring it.

### `@stacknext/next` is not installed

`init` reports the exact command for the detected package manager. Run it, or
re-run `init --install` to let StackNext invoke it. Do not start Next.js until
the dependency is present; otherwise the instrumentation import fails at
runtime.

## Startup and ports

### The dashboard does not open

`stacknext dev` prints the actual URL. If port 4400 is busy, it tries the next
ports and stores the chosen URL in `.stacknext/run.json`. Open the printed URL,
not a remembered one.

Check the runtime state:

```bash
npx stacknext status
```

### “Collector says waiting for app” or the dashboard stays empty

Start the app through StackNext:

```bash
npx stacknext dev
```

Do not start `next dev` separately unless you deliberately attach it to an
existing collector with `STACKNEXT_COLLECTOR_URL` and `STACKNEXT_TOKEN`. The
collector URL and token are generated per run.

Make a request after the app is ready. The dashboard reflects a bounded
in-memory sample; it does not show historical data from a previous run.

### Ports 4400–4425 are occupied

Stop leftover development processes before starting again. On Linux/macOS:

```bash
ps aux | grep -E 'stacknext|next dev'
```

On Windows, check Task Manager or:

```powershell
Get-Process node
```

Send SIGINT/SIGTERM to the `stacknext dev` process so it can clean up. If a child
Next.js process survives, stop it separately. `stacknext uninstall` refuses to
delete runtime files while the recorded process is alive.

### Stale `.stacknext/run.json`

If the process was killed without cleanup, the file can remain. Verify that the
recorded pid is not running, then remove `.stacknext/run.json` and start again.
Never copy a token from this file into source control or a bug report.

## Docker runtime

### Docker mode says the CLI or daemon is unavailable

Docker is optional. `stacknext dev` without `--runtime docker` never checks for
it. When Docker mode is selected, confirm that Docker is installed and running:

```bash
docker --version
docker info
```

On Windows and macOS, start Docker Desktop and wait until it reports that the
engine is running. On Linux, start the Docker service. In WSL2, enable Docker
Desktop's WSL integration for the distro that runs StackNext. If `docker` is not
on `PATH`, fix the shell environment or use native mode.

### The image cannot be pulled

The default image matches the installed CLI version:

```text
ghcr.io/<repository-owner>/stacknext:<version>
```

Check the version with `stacknext --version` and inspect the registry:

```bash
docker pull ghcr.io/marrrkkk/stacknext:0.7.0
```

If the package is private, run `docker login ghcr.io` first. If the version does
not exist, the release did not publish that image; upgrade the CLI or point
`STACKNEXT_DOCKER_IMAGE` at a locally built image:

```bash
docker build -f docker/Dockerfile -t stacknext:local .
STACKNEXT_DOCKER_IMAGE=stacknext:local pnpm exec stacknext dev --runtime docker
```

Do not use `latest` as a substitute for the matching version in normal
development; the CLI and image versions are expected to agree.

### The container starts but readiness times out

`stacknext dev` prints bounded container logs when the health check fails. The
collector must be able to read
`.stacknext/docker/config.json` through the read-only mount. Check:

- the project is inside a path shared with Docker Desktop;
- the config file exists and is mode `0600`;
- the container is running (`docker ps --all`);
- the published port is still bound to `127.0.0.1`;
- Docker has enough memory to start the container.

The CLI refuses to run Docker mode as root because the private config is mounted
with `0600` permissions. Run it as your normal development user.

### A stale container holds the dashboard port

An abnormal exit can leave a managed container behind. Start Docker mode again;
the CLI removes project-labelled stale containers before probing the port. You
can also run:

```bash
npx stacknext stop
```

`stop` only removes containers labelled with the current project hash. It never
prunes unrelated containers, images or volumes. It also removes
`.stacknext/docker` and `.stacknext/run.json`. Saved runs, baselines and
comparisons are not deleted.

`SIGKILL` cannot be intercepted. `stacknext stop` still recovers the managed
container, network and runtime state, but the host Next.js child may keep
running and hold the app port. Stop that process yourself before restarting the
app.

### `stacknext stop` refuses to stop a live runtime

That is intentional. Native mode runs inside the `stacknext dev` process and is
stopped with Ctrl+C (SIGINT/SIGTERM). `stacknext stop` manages Docker resources
only and also refuses to stop a live Docker runtime or a startup that still holds
the project runtime lock. If an old `run.json` has no `runtime` field, it is
treated as native.

### Docker mode works but native mode stopped working

The two modes share the same `.stacknext` directory and port range. Stop the
Docker runtime before switching back, then check for orphaned `next dev`
processes:

```bash
npx stacknext stop
npx stacknext status
```

Telemetry is in memory in both modes, so a restart starts a new sample.
Regression records are host files and remain available in either mode.

### Docker Desktop reports a file-sharing or permission error

Keep the project on a drive or path shared with Docker Desktop and run
`stacknext dev` as the same user that owns the project. On Windows, the image's
non-root `node` user is used; on POSIX the CLI passes the host uid/gid so the
read-only mount remains readable. Do not work around the error by mounting the
project root or running the container as root.

## No telemetry

### No requests or spans

- Confirm the app is running through `stacknext dev`.
- Confirm the app uses the Node.js runtime.
- Confirm the instrumentation file imports `@stacknext/next`.
- Make a request after the app compiles; the first request can be slower.
- Run compatibility checks with `npx stacknext doctor`.

If another OpenTelemetry provider is already registered, StackNext yields to it
by design. Use the existing provider's exporter or remove the conflicting
registration if you want StackNext to install its own.

### No database queries

- Drizzle: register `createStackNextDrizzleLogger()` in the client options.
- Prisma: enable `log: [{ emit: 'event', level: 'query' }]` and call
  `instrumentPrismaClient(client)` after creating the client.
- Confirm the route actually executes a query in the retention window.
- Drizzle durations are `null` because its logger API does not expose duration.
  `null` means unmeasured, not zero.

### No errors

Next.js calls `onRequestError` only when the instrumentation file exports it and
the failure happens in the Node.js runtime. Successful Server Actions do not
produce an error hook. Wrap successful actions with `withStackNextAction()` if
you want an action span.

### No custom spans or Server Action spans

The helpers are no-ops without an active OpenTelemetry provider. Confirm that
`registerStackNext()` ran (or that your own provider is active), the code runs in
the Node.js runtime, and the helper import is correct.

### Coverage says `not-observed` or `unknown`

Coverage is evidence from the current sample, not a score. The feature may not
have been exercised during the retention window. Read the item limitations and
the connection state before changing code. See
[instrumentation coverage](instrumentation-coverage.md).

## Diagnostics and regression

### Diagnostics reports no findings

The four rules need matching evidence in the current retention window. Exercise
the route, check the sample counts and thresholds, and remember that `possible`
findings are heuristics. A capped report is not a complete inventory.

### A finding disappeared

The report is rebuilt from the live sample. Telemetry aging out or a collector
restart removes its evidence. Treat a diagnostic id as a reference for the
current sample, not a durable identifier.

### `capture` exits 3

The Playwright child succeeded but the collected evidence was incomplete. Do not
ignore this exit code. Check that:

- the app and collector were running;
- exactly one Playwright worker was used;
- the test made requests through the fixture;
- the configured sample count and timeout were sufficient;
- the server route ran in the Node.js runtime.

See [regression testing](regression-testing.md).

### A comparison is `inconclusive`

Read `reasons` and `environmentDifferences` in the comparison. Common causes are
fewer than three verified samples per side, different Node.js/Next.js/Playwright
versions, different platforms, different adapter or instrumentation flags,
missing telemetry, or one-time route spans appearing on only one side. Warm the
routes before capturing a baseline.

Do not use `--ignore-environment` to turn a mismatched comparison into a pass.
It only allows the comparison to produce a result; it does not make the
environments equivalent.

### Playwright workers or timeouts

Captured runs must use one worker:

```bash
npx stacknext capture --name candidate -- \
  npx playwright test --workers=1 --repeat-each=3
```

If startup is slow, raise the capture timeout:

```bash
STACKNEXT_CAPTURE_TIMEOUT_MS=30000 \
STACKNEXT_CAPTURE_SETTLE_MS=1000 \
npx stacknext capture --name candidate -- npx playwright test --workers=1
```

## MCP and agents

### The MCP client cannot connect

- Start `stacknext dev` first; the MCP server reads `.stacknext/run.json`.
- Keep stdout for the MCP protocol. Logs must go to stderr.
- Run the client with the app directory as its working directory, or use the
  `pnpm --dir` form in [MCP](mcp.md).
- The server refuses non-loopback collector URLs by design.

### MCP has no data, but the dashboard does

The MCP server is read-only and uses the same loopback collector. Check the
client is not pointing at a different app directory or a stale token. Restart
the client after restarting `stacknext dev`, because the token changes.

### An agent cannot find the skill

The skill ships inside `@stacknext/cli`. Install the whole directory, including
`references/`, with the command for the client:

```bash
pnpm exec stacknext skill install --client opencode
pnpm exec stacknext skill install --client codex
pnpm exec stacknext skill install --client claude-code
```

`stacknext skill path` prints the bundled location. Do not copy only `SKILL.md`.
If an older copy exists, re-run with `--force`. See the client guides under
[docs/integrations](integrations/).

## Windows and WSL

- Run `stacknext dev` inside the same environment that runs the app. For WSL2,
  keep the app, browser and collector in WSL; forwarding loopback ports to
  Windows can break the local-only assumptions.
- Use SIGINT/SIGTERM semantics (Ctrl+C or `kill`) rather than closing a terminal
  window. StackNext uses a process group on Unix and `taskkill /T /F` on Windows,
  but an externally started Next.js child can still survive.
- Paths in capture records are normalized, but review exports before sharing
  them.
- If file watching is slow on a mounted Windows drive, move the repository into
  the WSL filesystem.

## Security and privacy

- Never post `.stacknext/run.json`; it contains the collector bearer token.
- Redaction is pattern-based, not a formal secret scanner. Review exports,
  regression records and diagnostic output before sharing.
- A captured record must never contain request/response bodies, headers,
  cookies, URL query values, SQL bind parameters, Playwright screenshots, video
  or trace archives. Treat unexpected data as a security issue and report it
  through [SECURITY.md](../SECURITY.md).

## Still stuck

Run `npx stacknext doctor --json` and open an issue with the StackNext, Node.js
and Next.js versions, package manager, operating system, reproduction steps and
redacted output. Do not include tokens, customer data or full `.stacknext`
records. See [SUPPORT.md](../SUPPORT.md).
