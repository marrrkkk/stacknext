---
title: Introduction
description: StackNext is a local-first debugging center for Next.js App Router apps, with deterministic diagnostics and Playwright regression evidence.
---

# StackNext documentation

StackNext collects OpenTelemetry spans, Drizzle/Prisma query events and Next.js
request errors from a Next.js App Router app over loopback, stores them in
memory, and exposes the current sample through a dashboard, a CLI and a
read-only MCP server. It derives deterministic diagnostic findings from the same
sample, freezes redacted snapshots, and compares Playwright-linked regression
captures against saved baselines.

Everything runs on your machine. There is no account, cloud service, AI API
client or outbound telemetry.

## Start here

- [Requirements](getting-started/requirements) — Node.js, Next.js and runtime
  support.
- [Installation](installation) — add StackNext to an existing app.
- [Quickstart](getting-started/quickstart) — start the collector and inspect the
  first request.
- [How the pieces fit](overview/what-is-stacknext) — collector, dashboard, CLI,
  diagnostics and regression evidence.
- [Package documentation](packages/index) — version-matched API references.

## Two ways to read the same documentation

This website is the guided, cross-package view. Each npm package also ships its
own Markdown documentation inside the archive:

```text
<cli-package>/docs/index.md
node_modules/@stacknext/next/docs/index.md
```

`<cli-package>` is the directory where `@stacknext/cli` is installed; in a
workspace that may be the workspace root. Those local files match the version
that is actually installed. AI coding
agents should read them before using an API, especially when the project may not
be on the latest release. The [local documentation guide](ai-agents/local-docs)
explains discovery, version checks and optional packages.

## What StackNext is not

StackNext is a development tool, not production APM. It supports Next.js 15 and
16 App Router on the Node.js runtime only, does not capture request or response
bodies, headers, cookies, URL query values or SQL bind parameters, and does not
run SQL, edit source code or call an AI provider. See
[limitations](limitations) for the full boundary.

## Common tasks

| Task | Start with |
| --- | --- |
| Install StackNext | [Installation](installation) |
| Understand coverage and missing data | [Instrumentation coverage](instrumentation-coverage) |
| Investigate an error or slow request | [Runtime evidence](guides/runtime-evidence) |
| Review deterministic findings | [Diagnostics](guides/diagnostics) |
| Compare Playwright runs | [Runtime regression testing](guides/regression) |
| Save or inspect a sample | [Snapshots](guides/snapshots) |
| Connect an AI coding agent | [AI agents](ai-agents/index) |
| Work on StackNext itself | [Contributing](contributing/index) |
