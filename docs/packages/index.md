---
title: Packages
description: Version-matched documentation for every StackNext package, including public integration packages and internal implementation packages.
---

Every published StackNext package ships its own Markdown documentation:

```text
node_modules/@stacknext/<package>/docs/index.md
```

These pages are generated from those canonical files. The copy on this site and
the copy in the npm archive come from the same source, so the local files are
the version-matched reference for an installed project.

## Public integration packages

Install these directly when the app uses the corresponding feature.

| Package | Install | Responsibility |
| --- | --- | --- |
| [`@stacknext/cli`](cli/index) | Required | Collector, dashboard host, CLI and local docs index |
| [`@stacknext/next`](next/index) | Required for instrumentation | OpenTelemetry registration, errors and manual spans |
| [`@stacknext/playwright`](playwright/index) | Optional | Playwright fixture and verified scenario correlation |
| [`@stacknext/drizzle`](drizzle/index) | Optional | Drizzle query events |
| [`@stacknext/prisma`](prisma/index) | Optional | Prisma query events |

## Internal implementation packages

These are installed transitively or by the CLI. Their documentation is for
maintainers and advanced contributors; they are not normal installation
requirements.

| Package | Responsibility |
| --- | --- |
| [`@stacknext/core`](core/index) | Wire schemas, transport, redaction, config, store and snapshots |
| [`@stacknext/diagnostics`](diagnostics/index) | Fingerprinting and the six deterministic rules |
| [`@stacknext/regression`](regression/index) | Capture, baseline and comparison schemas and storage |
| [`@stacknext/mcp`](mcp/index) | Read-only stdio MCP server |
| [`@stacknext/dashboard`](dashboard/index) | Static React/Vite dashboard served by the CLI |

## Which reference to read

| Task | Read |
| --- | --- |
| Configure the app or collector | [`core/configuration`](core/configuration), [`next/configuration`](next/configuration) |
| Understand the wire format | [`core/schemas`](core/schemas), [`core/transport`](core/transport) |
| Check what is redacted | [`core/redaction`](core/redaction) |
| Add a manual span or action | [`next/custom-spans`](next/custom-spans) |
| Understand a diagnostic finding | [`diagnostics/rules`](diagnostics/rules), [`diagnostics/findings`](diagnostics/findings) |
| Work with capture records | [`regression/captures`](regression/captures), [`regression/comparisons`](regression/comparisons) |
| Use MCP tools | [`mcp/tools`](mcp/tools), [`mcp/security`](mcp/security) |
| Save or inspect a snapshot | [`core/snapshots`](core/snapshots) |
| Change the CLI or collector | [`cli/index`](cli/index), [`dashboard/routes`](dashboard/routes) |

## Version checks

The docs describe the version in the adjacent `package.json`. To confirm the
installed version:

```bash
node -p "require('@stacknext/next/package.json').version"
```

Do not assume a package is installed because it appears in this documentation.
Check the directory first. See
[local documentation](../ai-agents/local-docs).
