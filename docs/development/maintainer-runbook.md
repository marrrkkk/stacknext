# Maintainer runbook

This page is the short operational checklist for maintainers. The
[release process](../deployment/release-process.md) remains the canonical
release reference; this runbook covers the recurring triage and verification
work around it.

## Before changing anything

1. Read [AGENTS.md](../../AGENTS.md) and the nearest package `AGENTS.md`.
2. Confirm the current version and release state:
   ```bash
   git fetch origin
   git status --short --branch
   git log --oneline -5
   node -p "require('./packages/core/package.json').version"
   ```
3. Use a focused branch and a Conventional Commit title. Release titles become
   the commit on `main`; do not use a vague pull request title.

## Version parity

Every tracked manifest and engine constant shares one version. The release
scripts update them together, and the test suite enforces the result:

```bash
pnpm exec vitest run packages/cli/test/version.test.ts
```

The check covers the repository root, `apps/example`, `apps/www`, all ten
public packages, `CLI_VERSION`, `STACKNEXT_SDK_VERSION`,
`DIAGNOSTICS_ENGINE_VERSION`, `STACKNEXT_REGRESSION_ENGINE_VERSION` and the
Agent Skill `metadata.version`. Never bump one package or constant by hand.
If the check fails, fix the drifted manifest before continuing; do not weaken
the assertion.

A locally resolved `stacknext --version` can be stale when `dist` predates the
source constants. Run `pnpm build` before trusting the binary or the package
smoke tests.

## Triage a reported problem

1. Ask for the StackNext version, Node.js version, Next.js version, package
   manager and the exact command. Do not ask for a collector token or captured
   telemetry.
2. Reproduce with the example app when possible:
   ```bash
   pnpm install
   pnpm build
   cd apps/example
   pnpm exec stacknext dev
   ```
3. Run the built-in checks in another terminal:
   ```bash
   npx stacknext status
   npx stacknext doctor
   npx stacknext coverage
   npx stacknext mcp --check
   ```
4. Check the [troubleshooting guide](../../apps/docs/troubleshooting.mdx) and
   the package reference before proposing a code change.

### Empty dashboard or no requests

- `doctor` fails when an existing OpenTelemetry provider owns tracing and
  StackNext is only heartbeating. This is expected by design; the fix is to
  remove the competing provider and let `@stacknext/next` register, not to add
  a second SDK.
- Check `.next/lock` or `.next/dev/lock`. `stacknext dev` refuses to start when
  a Next.js dev server is already running for the project; stop the old server
  first so StackNext instruments the process it starts.
- A first request to a route includes Next.js compile time. Warm the route,
  then request it again before judging latency or saving a sample.
- The store is in memory. If `stacknext dev` restarted, the sample is gone;
  frozen snapshots under `.stacknext` are the durable copy.

### Port or process problems

- The collector and dashboard try loopback ports starting at `4400`. The
  example app uses `4402`.
- Stop `stacknext dev` with SIGINT or SIGTERM so it removes
  `.stacknext/run.json`. Then check for orphaned `next dev` processes on ports
  4400–4425.
- Never delete `.stacknext/run.json` while the process is running; it holds the
  short-lived bearer token.

### Regression or snapshot reports

- A regression sample is verified only by the injected trace id plus a server
  span parented to the injected span id. There is no time-window fallback.
- `inconclusive`, `not-observed` and `unknown` are evidence states, not bugs.
  Do not present them as passes or failures.
- Snapshots and baselines are immutable, private records. Do not ask a reporter
  to upload them; inspect locally and share only a redacted export when the
  privacy rules allow it.

## Pull request gate

Run the full default gate for code changes:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:docs
```

Add the checks that match the change:

| Change | Additional check |
| --- | --- |
| Runtime, CLI, collector, dashboard, MCP, regression or snapshots | `pnpm test:e2e` after `pnpm build` |
| Package metadata, exports, archives, docs or skill copies | `pnpm test:packages` |
| External installation or compatibility | `pnpm test:consumer --next 16.4.3 --pm npm --skip-build` |
| Captured fields or redaction | [Redaction verification](../testing/testing-strategy.md#redaction-verification) and the secret-leak tests |
| Performance-sensitive runtime code | the relevant benchmark under `scripts/benchmark*.mjs` |

Before a baseline capture, warm `/`, `/projects/1` and `/api/n-plus-one`, use
one Playwright worker and at least three samples.

## Release PR review

The release workflow updates every manifest, constant and the Agent Skill
version, moves `[Unreleased]` under the new version and regenerates the website
changelog. Review that the PR contains exactly that mechanical change plus the
changelog section. Do not hand-edit generated files or split a release by
package.

Before approving:

1. Confirm the version follows SemVer and the changelog groups are valid.
2. Check `pnpm check:docs` and the release workflow gate list.
3. Confirm no `.stacknext`, token, database, log, `dist` or `.next` output is
   committed.
4. After publication, verify the tag, GitHub release and npm versions for all
   ten packages. Published versions are immutable; ship a patch instead of
   unpublishing.

## Security reports

Follow [SECURITY.md](../../SECURITY.md). Do not open a public issue for a
vulnerability, and never ask for a token, captured body, header, cookie, query
value or SQL bind parameter in a public thread.

## What not to do

- Do not add a cloud service, remote transport, telemetry or managed container
  runtime.
- Do not add an LLM provider, automated source edits, SQL/EXPLAIN/index advice
  or alerting.
- Do not claim a client, model, platform or benchmark passed without a recorded
  run.
- Do not weaken a privacy, loopback, bounded-storage or read-only test to make a
  change pass.
