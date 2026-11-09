# Documentation discovery

Package documentation ships inside each installed StackNext npm package. It
describes the installed version, not the latest website release.

## Read in this order

1. The CLI package's `docs/index.md` — entry point and index. Resolve it from the
   app directory; in a workspace it may be hoisted to the workspace root.
2. The CLI package's `docs/packages.md` — package table with versions,
   visibility, roles and relative paths.
3. The `docs/index.md` of every package involved in the task.

The paths in `packages.md` are relative to the CLI docs directory. Check that a
directory exists before reading it. Optional packages (`@stacknext/playwright`,
`@stacknext/drizzle`, `@stacknext/prisma`) may be absent.

## Confirm the version

Read the package's own `package.json` next to the docs directory, or ask the
user to run:

```bash
node -p "require('@stacknext/next/package.json').version"
```

If the local docs are missing, do not invent API details. Say which package
version is installed and use only behavior visible in the installed
implementation or tests. The website at the project repository is a conceptual
and cross-package reference; it may describe a newer release.

## What each reference owns

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:288ca3f0efa2b410cf1f3bece0fab59bbb1407b61e1f2e543eda24a9230e58d8 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:a8fa35dd707530ebdf92d07c80b1058c90cff608b5fd3bf71a1c4876289a1632 -->

| Need | Read |
| --- | --- |
| Configuration, wire types, redaction | `@stacknext/core/docs` |
| Registration, manual spans, actions | `@stacknext/next/docs` |
| Diagnostic rules and evidence | `@stacknext/diagnostics/docs` (only when the package ships documentation) |
| Capture, baseline and comparison formats | `@stacknext/regression/docs` |
| Fixture and correlation | `@stacknext/playwright/docs` |
| CLI commands and local index | `@stacknext/cli/docs` |
| MCP tools, prompts and security | `@stacknext/mcp/docs` (only when the package ships documentation) |
| Query adapters | `@stacknext/drizzle/docs`, `@stacknext/prisma/docs` |

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

The skill owns procedures. The package docs own API details. Do not copy large
API tables into a report; cite the package and page you used.

## If the project has no local docs

Older installations may not include `docs/` in the package archive. Then:

1. Tell the user the installed package lacks local documentation.
2. Use `stacknext` CLI help and the installed TypeScript declarations.
3. Do not assume an API exists because the website shows it for another
   version.
4. Suggest upgrading the packages, or running `stacknext init --agents` after
   upgrading to refresh managed project instructions.
