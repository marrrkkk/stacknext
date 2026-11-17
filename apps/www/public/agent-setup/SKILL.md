---
name: stacknext-setup
description: Install, configure and verify StackNext in a Next.js 15 or 16 App Router project. Use when the user asks to set up StackNext, add its local collector and dashboard, connect the read-only MCP server to a coding agent, or install the stacknext-debugging Agent Skill.
license: MIT
compatibility: Next.js 15 or 16 App Router on the Node.js runtime with Node.js 20.9 or newer. No cloud account, API key or hosted service is required.
metadata:
  author: StackNext
---

# StackNext setup

Set up StackNext in the current Next.js App Router project. StackNext is a
local-first debugging center: the collector, dashboard and read-only MCP server
run on this machine. There is no hosted service, AI provider or outbound
telemetry.

Treat setup as a state machine: inspect, install, initialize, configure the
agent surfaces, start the collector and verify each layer. Do not report success
until the verification commands pass.

## 1. Inspect before changing anything

1. Find the application root: the nearest `package.json` that declares `next`
   and contains `app/` or `src/app/`. Install there, not at a workspace root.
2. Confirm Next.js 15 or 16, the App Router and the Node.js runtime. Do not add
   Edge runtime, Pages Router or production-monitoring support.
3. Read `package.json`, the lockfile and `next.config` to detect the package
   manager (npm, pnpm, yarn or bun) and follow the project's conventions.
4. Check for an existing `instrumentation.ts` or `instrumentation.js`. Never
   overwrite it.
5. If this is not a supported Next.js App Router app, stop and report the exact
   mismatch instead of forcing an install.

## 2. Install the packages

Install `@stacknext/next` as a dependency and `@stacknext/cli` as a development
dependency. Use the detected package manager.

```bash
npm install @stacknext/next
npm install --save-dev @stacknext/cli
```

```bash
pnpm add @stacknext/next
pnpm add -D @stacknext/cli
```

For yarn or bun, use the equivalent add commands. Do not install the internal
packages directly; the CLI brings the collector, dashboard, diagnostics,
regression and MCP packages with it.

Add an optional adapter only when the project already uses it or the user asks
for it: `@stacknext/drizzle`, `@stacknext/prisma` or `@stacknext/playwright`.
Their peer dependencies are supplied by the application.

## 3. Initialize the project

```bash
npx stacknext init
```

With pnpm, run `pnpm exec stacknext init`. Use the pnpm, yarn or bun equivalent
for the detected package manager.

`init` writes `stacknext.config.json` with private permissions and creates
`instrumentation.ts`/`.js` only when absent. If an instrumentation file already
exists, `init` leaves it untouched and prints the hook to add manually. In that
case:

- call `registerStackNext()` inside the existing `register()`;
- keep any existing monitoring setup;
- call `stackNextOnRequestError(error, request, context)` inside an existing
  `onRequestError`, or export it when the file has no error hook.

Never create a second OpenTelemetry SDK or replace an existing provider.
`registerStackNext()` yields to an existing provider.

Add the managed agent instructions when the user wants project-level StackNext
rules for a coding agent:

```bash
npx stacknext init --agents
```

This creates `AGENTS.md` when absent and otherwise updates only the marked
StackNext block, preserving the rest of the file. Do not pass `--agents` when
the user does not want the file changed.

## 4. Configure the read-only MCP server

The MCP server is local stdio. Use an absolute path to the application.
Never use SSE, HTTP or a remote proxy, and never put the collector token in a
client configuration file.

```bash
npm --prefix /absolute/path/to/your-app exec -- stacknext mcp
pnpm --dir /absolute/path/to/your-app exec stacknext mcp
```

### Claude Code

```bash
claude mcp add --scope project stacknext -- \
  pnpm --dir /absolute/path/to/your-app exec stacknext mcp
```

### Codex

Add to `.codex/config.toml` or `~/.codex/config.toml`:

```toml
[mcp_servers.stacknext]
command = "pnpm"
args = ["--dir", "/absolute/path/to/your-app", "exec", "stacknext", "mcp"]
cwd = "/absolute/path/to/your-app"
```

### OpenCode

Create or update `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "stacknext": {
        "type": "local",
        "command": [
          "pnpm",
          "--dir",
          "/absolute/path/to/your-app",
          "exec",
          "stacknext",
          "mcp"
        ],
        "codemode": false
      }
    }
  }
}
```

### Other MCP clients

Use the same stdio command form in the client's own configuration format. Do
not claim support for a client you have not connected and checked.

## 5. Install the debugging Agent Skill

```bash
pnpm exec stacknext skill install --client opencode
pnpm exec stacknext skill install --client codex
pnpm exec stacknext skill install --client claude-code
```

Use the command for the active client. The command copies the whole
`stacknext-debugging` directory, including its references. Re-run with
`--force` to update an existing copy. Do not invent a `--client` value for a
client the CLI does not list; keep the MCP instructions instead and let the
user install the skill through that client's documented mechanism.

## 6. Start the collector and verify

```bash
pnpm exec stacknext dev
```

`dev` starts the loopback collector and dashboard, writes `.stacknext/run.json`
with mode `0600`, and runs the app's own `dev` script. Leave it running. The
dashboard is usually at `http://127.0.0.1:4400`.

In another shell, verify the layers separately:

```bash
pnpm exec stacknext status
pnpm exec stacknext doctor
pnpm exec stacknext mcp --check
```

Then make a request to the running application, repeat the request once so
Next.js compile time is not the measurement, and check `status` again. Expect
captured requests. `doctor` checks the instrumentation, collector, adapters,
dashboard build and first-request capture. `mcp --check` verifies the collector
connection and the read-only MCP surface.

If `doctor` fails, stop and report the exact failing check. Do not claim the
setup works because a package installed or a process started.

Stop a `dev` process you started for verification with SIGINT or SIGTERM, not
SIGKILL, and only when the user does not need it running. Never print, paste or
commit `.stacknext/run.json`; it contains a bearer token.

## 7. Report

Report:

- the files and configuration changed;
- the package manager, Next.js version and StackNext version;
- each command that passed, with its actual result;
- the MCP client and skill installation path;
- what remains manual, such as restarting or approving the MCP client.

Do not claim a model-driven client test. Installing a skill or connecting stdio
does not prove that the client will choose the right tools.

## Boundaries

- StackNext binds to loopback and is for local development, not production APM.
- Do not expose the collector or dashboard to a network, add TLS or add
  multi-user authentication.
- Bodies, headers, cookies, URL query values and SQL bind parameters are never
  captured. Do not try to recover them.
- The MCP server is read-only. It cannot edit the app, replay requests, capture
  runs, save baselines, run comparisons or delete records.
- Diagnostic findings are evidence-backed heuristics, not confirmed root
  causes. `inconclusive` regression comparisons are not passes.
- Only Next.js 15 and 16 on the App Router and Node.js runtime are supported.
  Edge runtime, the Pages Router and production use are out of scope.
