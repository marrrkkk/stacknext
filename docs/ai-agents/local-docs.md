---
title: Local documentation
description: Find and use the version-matched Markdown documentation shipped inside installed StackNext packages.
---

StackNext releases that bundle package documentation include a `docs/`
directory in each documented package's npm archive. These docs sit next to the
installed implementation and describe the same version. Earlier releases may
not include bundled docs.

## Entry point

Start with the CLI package's own `docs/` directory. Its generated entry points
are `docs/index.md` and `docs/packages.md`. In a workspace the CLI may be
installed at the workspace root rather than in the app's `node_modules`.

```text
<cli-package>/docs/index.md
<cli-package>/docs/packages.md
```

`packages.md` lists every documented package, its version, whether it is public
or internal, its role and the relative path to its docs. The paths are written
as code because optional packages may be absent.

## Read only what is installed

```text
node_modules/@stacknext/next/docs/index.md        # required for instrumentation
node_modules/@stacknext/drizzle/docs/index.md     # only if Drizzle is installed
node_modules/@stacknext/prisma/docs/index.md      # only if Prisma is installed
node_modules/@stacknext/playwright/docs/index.md  # only for captured tests
```

These are direct-install paths. If a package is hoisted, resolve it from the app
directory as described under [Monorepos](#monorepos).

`@stacknext/core` is installed transitively. In a pnpm workspace it may not
appear at the app-root `node_modules` path; use its relative path in
`packages.md` instead of assuming the root layout.

Before reading a path, check that it exists. Do not tell an agent to read a
package that the project does not use.

## Confirm the version

The package's `package.json` is the source of truth:

```bash
node -p "require('@stacknext/next/package.json').version"
```

An agent should compare that value with the version in the docs table or the
package's own frontmatter when the project may not be on the latest release.
StackNext does not maintain a separate versioned-docs service; the local archive
is the primary version safeguard. If your release has no bundled docs, use the
`docs/` directory at its matching `v<version>` tag in the
[StackNext source repository](https://github.com/marrrkkk/stacknext/tags),
for example [v0.6.1 documentation](https://github.com/marrrkkk/stacknext/tree/v0.6.1/docs).
The [release procedure](../releasing) defines these version tags. Verify the tag
against the installed package version; the website reflects the current checkout.

## Prefer local docs over this site

Use the local files when:

- writing code against `@stacknext/next`, an adapter or the CLI;
- the project's StackNext version may differ from the website;
- an API, default, validation range or error behavior matters.

Use this site when:

- learning the architecture or a cross-package workflow;
- no StackNext package is installed yet;
- looking for conceptual explanations, privacy rules or contributing guidance.

## Monorepos

In a pnpm workspace, a package may be hoisted to the workspace root's
`node_modules` or remain under the app's `node_modules`. Resolve from the app
directory that contains `.stacknext` and the `stacknext` dependency. Do not
assume a single global path.

## Related

- [Packages](../packages/index)
- [AGENTS.md integration](agents-md)
- [Agent Skill](skill)
