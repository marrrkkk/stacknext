---
title: Quickstart
description: Install StackNext, start the collector and inspect your first request.
---

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:0ecf66edd64d774f513fa8530ae4ea3c38396e393e08f0c3219cae0f6920c1b5 -->

## 1. Install

Inside the Next.js app project:

```bash
pnpm add @stacknext/next
pnpm add -D @stacknext/cli
pnpm exec stacknext init
```

`init` creates `stacknext.config.json` and an `instrumentation.ts` or
`instrumentation.js` file when they do not exist. It never overwrites an
existing instrumentation file. See [installation](https://github.com/marrrkkk/stacknext/blob/main/docs/installation.md) for the
manual patch and monorepo details.

<!-- /coderabbit-ai-generated:v1 -->

## 2. Optional: install project agent instructions

```bash
pnpm exec stacknext init --agents
```

This adds or updates only a marker-delimited StackNext block in `AGENTS.md`.
Existing instructions are preserved. The block points agents at the local
documentation shipped with the installed packages. See
[AGENTS.md integration](../ai-agents/agents-md).

## 3. Start the collector and app

```bash
pnpm exec stacknext dev
```

`dev` starts the collector, runs the project's `dev` script, and writes
`.stacknext/run.json` with a short-lived bearer token. Open the printed
dashboard URL, usually `http://127.0.0.1:4400`, and make a request to the app.

## 4. Verify

```bash
pnpm exec stacknext status
pnpm exec stacknext doctor
pnpm exec stacknext coverage
```

The Overview page should show requests, and coverage should report what the
sample observed. `not-observed` and `unknown` are valid evidence states, not
errors.

## 5. Inspect the sample

- **Requests** and **Traces** show route, status, duration and span timelines.
- **Database** shows query events; Drizzle durations are `null`.
- **Errors** shows redacted errors and any correlated trace.
- **Diagnostics** shows deterministic findings. Read the evidence and
  limitations before changing code.
- **Snapshots** lets you freeze the current sample.

CLI equivalents:

```bash
pnpm exec stacknext diagnose
pnpm exec stacknext export --stdout
pnpm exec stacknext snapshot save --label "first look"
```

## Next steps

- [Connect an AI coding agent](../ai-agents/index).
- [Investigate runtime evidence](../guides/runtime-evidence).
- [Run a Playwright regression comparison](../guides/regression).
- [Read the installed package docs](../ai-agents/local-docs) for exact APIs.
