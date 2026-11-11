# AGENTS.md — apps/docs

Scope: the public Mintlify site. Read the root
[`AGENTS.md`](https://github.com/marrrkkk/stacknext/blob/main/AGENTS.md) first;
repository-wide rules still apply.

## What lives here

- Hand-authored product guides, concepts, CLI, integration, AI-agent, privacy
  and troubleshooting pages, written as `.mdx`.
- Site assets, screenshots and `docs.json`.
- No generated package copies and no contributor-only material.

Package API reference is canonical in `packages/<package>/docs/` and ships inside
each npm archive. Contributor and engineering documentation lives in the root
[`docs/`](https://github.com/marrrkkk/stacknext/blob/main/docs/README.md). Do
not duplicate either here.

## Rules

- Write for developers using StackNext, not for people maintaining the
  repository. No build, test, release, contribution, internal package
  architecture or codebase-maintenance guidance.
- `docs.json` owns navigation, redirects, navbar, SEO and
  `markdown.instructions`. Every local navigation entry must resolve, have
  `title` and `description` frontmatter, and appear only once. Navigation paths
  stay extensionless.
- Keep the navigation small. Prefer a section on an existing page over a new
  page for a small topic, and do not add a page that only links elsewhere.
- Hand-authored pages are `.mdx`. Link between them with extensionless relative
  paths such as `../mcp`. Never copy package docs into this site; link to the
  installed reference or to `/reference/packages` instead.
- Keep public URLs stable. When a public page moves, merge or is removed, add a
  redirect in `docs.json` to the closest relevant destination that still
  exists. Do not redirect every old page to the homepage and do not create
  redirect chains.
- Absolute links to the production site must point to a navigation page or a
  configured redirect. `pnpm check:docs` validates these; see
  `https://stack-next.mintlify.site/guides/diagnostics` for a valid example.
- Engineering docs are linked with absolute GitHub URLs, not relative paths
  outside this Mintlify root.
- Do not commit `llms.txt` or `llms-full.txt`. Mintlify generates them from the
  navigation and page content. Keep `markdown.instructions` accurate.
- This site is not a runtime dependency of `stacknext dev`. Do not add imports
  from the workspace packages or a build step that the CLI needs.
- Screenshots must use the example app with redacted local data. Never include
  tokens, raw query values, customer routes or unredacted telemetry.

## Verification

```bash
pnpm check:docs
pnpm docs:dev
```

CI also runs from this directory:

```bash
npx --yes mint@4.2.1165 validate --no-build --format json
npx --yes mint@4.2.1165 broken-links
```

`pnpm check:docs` is the fast local gate; the Mintlify commands are the final
check for MDX, navigation and rendered links.
