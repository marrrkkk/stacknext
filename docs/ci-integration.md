# CI integration

StackNext regression checks fit into a normal CI job without a hosted StackNext
service. The CI runner is the machine: the collector binds to loopback, the
Playwright browser runs there, and run, baseline and comparison files stay in
the workspace. GitHub Actions is used as the example, but the same steps work
in any Linux/macOS/Windows runner that can run Node.js, Playwright and the app.

The default is report-only. A job fails only when `stacknext compare` is given a
matching `--fail-on` option.

## What the job needs

- Node.js 20.9 or newer.
- pnpm or npm with the repository's lockfile.
- The app built and able to start in the runner.
- Playwright browsers installed
  (`pnpm exec playwright install --with-deps chromium`).
- One Playwright worker.
- A baseline file whose recorded environment matches the candidate runner.
- A repeated scenario count that meets the comparison minimum; the default is
  three verified samples per scenario.

Do not run captured Playwright tests in parallel. The correlation protocol is
verified per injected trace with one worker; a second worker can make the
sample set incomplete.

## GitHub Actions example

This example assumes the app directory is `apps/my-app`, the Playwright config
starts the app through `webServer`, and a baseline file is available from a
previous baseline job or artifact. Adjust paths and package manager commands.

```yaml
name: runtime-regression

on:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: runtime-regression-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  regression:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    env:
      CI: 'true'
      NEXT_TELEMETRY_DISABLED: '1'
    defaults:
      run:
        working-directory: apps/my-app
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 12.16.1

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        working-directory: .
        run: pnpm install --frozen-lockfile

      - name: Install Playwright Chromium
        run: pnpm exec playwright install --with-deps chromium

      - name: Build
        working-directory: .
        run: pnpm build

      # Restore a baseline captured on the same OS/Node/Next/Playwright setup.
      # See "Where the baseline comes from" below.
      - name: Restore baseline
        run: |
          mkdir -p .stacknext/baselines
          cp ci-baselines/base-0123456789abcdef.json .stacknext/baselines/

      - name: Capture candidate
        run: |
          set -o pipefail
          pnpm exec stacknext capture \
            --name "ci candidate" \
            --quiet --json \
            -- pnpm exec playwright test --workers=1 --repeat-each=3 \
            > candidate.json

      - name: Compare with the baseline
        run: |
          CANDIDATE_ID=$(jq -r .run.id candidate.json)
          pnpm exec stacknext compare \
            base-0123456789abcdef "$CANDIDATE_ID" \
            --fail-on regression \
            --json > comparison.json

      - name: Upload regression records
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: stacknext-regression
          path: |
            apps/my-app/candidate.json
            apps/my-app/comparison.json
            apps/my-app/.stacknext/runs/
            apps/my-app/.stacknext/baselines/
            apps/my-app/.stacknext/comparisons/
          if-no-files-found: ignore
```

The `--fail-on regression` line makes the compare step exit 1 only for a
`regressed` comparison. Without it, the step succeeds and the result is
report-only. Use `--fail-on inconclusive` to fail when the evidence is
insufficient, or `--fail-on any` to fail on either regression or inconclusive.

The capture step itself exits non-zero when the child test command fails, and
exits **3** when the child succeeds but telemetry is incomplete. Do not ignore
that exit code. A job that continues after exit 3 is treating missing evidence
as a pass.

## Where the baseline comes from

The baseline must be produced by an earlier capture and saved with
`stacknext baseline save`. Pick one of these approaches:

### Same-runner baseline job

Run both the baseline and candidate captures in one workflow on the same runner
type. This is the most reliable option because Node.js, Next.js, Playwright, OS
and database versions are identical.

1. Check out the known-good revision in a separate directory or worktree.
2. Install, build and start that revision.
3. Capture it and save a baseline.
4. Check out the candidate revision in the primary workspace.
5. Capture the candidate and compare.

If the two revisions use different installs, keep the ports, app names and
collector processes separate. Do not compare runs from two matrix entries: a
baseline and candidate on different operating systems are environment-mismatched
and default to `inconclusive`.

### Stored baseline artifact

Save a baseline from the main branch once, upload the JSON as an artifact, and
download it into later PR jobs. A download from a different workflow run needs
the source `run-id` and a token with `actions: read`; without them,
`actions/download-artifact` only reads the current run. Store the baseline run
id as a repository variable and grant the workflow that permission:

```yaml
permissions:
  contents: read
  actions: read

# In the baseline job:
      - name: Upload baseline artifact
        uses: actions/upload-artifact@v4
        with:
          name: stacknext-baseline
          path: apps/my-app/.stacknext/baselines/base-*.json
          if-no-files-found: error

# In a later candidate job:
      - name: Download baseline artifact
        uses: actions/download-artifact@v4
        with:
          name: stacknext-baseline
          path: apps/my-app/.stacknext/baselines
          run-id: ${{ vars.STACKNEXT_BASELINE_RUN_ID }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Artifacts expire according to repository settings. Re-capture the baseline
whenever Node.js, Next.js, Playwright, the database setup or the instrumentation
flags change. A stale artifact is not a stable reference.

### Reviewed baseline file

A team can keep a reviewed baseline JSON in a directory outside `.stacknext`,
for example `ci-baselines/`, and copy it into the workspace at the start of the
job. This makes the reference reviewable in the repository, but the file still
contains redacted route, span, query, error and environment data. Review it
before committing, and update it with an intentional commit when the expected
runtime behavior changes. Never commit `.stacknext` runtime state, tokens or
`.stacknext/run.json`.

## Capture wiring

There are two supported ways to give the fixture a collector:

### App started by Playwright `webServer`

This is the smallest CI setup. `stacknext capture` starts an ephemeral collector
and passes the run id, collector URL and token to the child. Playwright's
`webServer` inherits the environment and starts the app:

```ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:4402',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: process.env.STACKNEXT_APP_URL ?? 'http://127.0.0.1:4402',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
})
```

Then:

```bash
pnpm exec stacknext capture \
  --name "ci candidate" --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 \
  > candidate.json
```

If the CI runner is slow to start the dev server, raise the fixture timeout in
the child environment:

```bash
STACKNEXT_CAPTURE_TIMEOUT_MS=30000 \
STACKNEXT_CAPTURE_SETTLE_MS=1000 \
pnpm exec stacknext capture --name "ci candidate" --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 \
  > candidate.json
```

### App started by `stacknext dev`

If the workflow starts the app separately, run `stacknext dev` in the app
directory and wait for both the collector and the app before capturing. Capture
attaches to the live collector when `.stacknext/run.json` is valid.

```bash
pnpm exec stacknext dev --quiet > stacknext-dev.log 2>&1 &
echo $! > stacknext-dev.pid

for attempt in $(seq 1 60); do
  curl -fsS http://127.0.0.1:4400/api/ping > /dev/null && break
  sleep 1
done

# Warm route modules so one-time spans do not appear only on one side.
for path in / /projects/1 /api/n-plus-one; do
  curl -fsS -o /dev/null "http://127.0.0.1:4402$path"
done
```

Always stop the process with SIGINT or SIGTERM in a cleanup step so
`stacknext dev` closes the collector and removes `.stacknext/run.json`:

```yaml
      - name: Stop StackNext
        if: always()
        run: |
          if [ -f stacknext-dev.pid ]; then
            kill -TERM "$(cat stacknext-dev.pid)" || true
          fi
```

Do not leave orphaned `next dev` processes holding the app or collector port.
If the runner reuses a process between steps, check ports 4400-4425 before the
capture step.

## Compare thresholds

The defaults are tuned for a local development loop:

| Option | Default | Effect |
| --- | --- | --- |
| `--min-samples` | 3 | Verified samples required per side and per metric. |
| `--duration-regression-pct` | 20 | Percent threshold for a duration regression. |
| `--duration-regression-ms` | 25 | Absolute threshold for a duration regression. |
| `--duration-improvement-pct` | 20 | Percent threshold for an improvement. |
| `--duration-improvement-ms` | 25 | Absolute threshold for an improvement. |
| `--count-regression-min` | 1 | Minimum increase for span/query/error/finding counts. |

A duration regression must cross both the absolute and percent thresholds (or
have a zero baseline median, where only the absolute threshold applies). Counts
use the minimum increase. See
[comparison methodology](comparison-methodology.md) for the exact ordering and
severity rules.

For CI, keep the defaults unless you have measured your own noise. Do not lower
the minimum below three just to make a job pass; an inconclusive result is
informative and should be fixed by collecting more samples or matching the
environment.

## Environment matching

The comparison records these facts for each side and defaults to `inconclusive`
when they differ:

- Node.js version
- Next.js version
- platform and architecture
- `nodejs` runtime
- enabled database adapters
- verbose tracing, fetch capture and error capture flags
- SDK version
- Playwright version
- project name

Pin the runner image and versions. `ubuntu-latest` can move; `ubuntu-24.04` is
more reproducible. Do not build a baseline on macOS and compare it with a Linux
candidate unless you explicitly accept `--ignore-environment` and its warning.
The option does not make the environments equivalent; it only allows the
comparison to produce a result.

## Artifacts and privacy

Upload these records for review:

- the capture JSON printed by `--json`;
- `.stacknext/runs/run-*.json`;
- `.stacknext/baselines/base-*.json`;
- `.stacknext/comparisons/cmp-*.json`;
- the Playwright report if your project produces one.

The regression records contain redacted scenario titles and file paths,
normalized routes and SQL shapes, bounded span/error evidence, timings and
environment facts. They do not contain request/response bodies, headers,
cookies, URL query values, SQL bind parameters, screenshots, video or Playwright
trace archives. They are still local debugging artifacts; review them before
sharing artifacts outside the team. Never upload `.stacknext/run.json` or any
file containing the collector bearer token.

The capture command records a sanitized command line: local home paths are
shortened to `~`, URL query strings are removed and known secret patterns are
redacted. Do not pass secrets as command-line arguments.

## Concurrency and cleanup

- Use one capture per collector. Do not run two `stacknext capture` processes
  against the same live `stacknext dev` instance at the same time.
- Use one Playwright worker for captured runs.
- Give parallel CI jobs separate ports or separate ephemeral collectors.
- Always stop `stacknext dev` with a signal and check for orphaned `next dev`
  processes.
- Set a job timeout. A stuck browser or dev server should fail the job rather
  than consume a runner indefinitely.
- Keep `CI=true` so Playwright does not reuse a developer's server by accident.

## What CI does not do

- It does not upload telemetry to StackNext or any hosted service.
- It does not run an LLM or ask an AI provider to classify a regression.
- It does not take screenshots, record video or read Playwright trace archives.
- It does not prove statistical significance or causality.
- It does not make an `inconclusive` comparison a pass.
- It does not automatically delete old baselines or comparisons. Artifact and
  workspace retention are controlled by your CI provider.

## Related documentation

- [Runtime regression testing](regression-testing.md)
- [Playwright integration](playwright-integration.md)
- [Baselines](baselines.md)
- [Comparison methodology](comparison-methodology.md)
- [Privacy and redaction](privacy.md)
