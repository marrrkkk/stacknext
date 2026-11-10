# AGENTS.md — apps/docs

Scope: the public Mintlify site. Read the root
[`AGENTS.md`](https://github.com/marrrkkk/stacknext/blob/main/AGENTS.md) first;
repository-wide rules still apply.

## What lives here

- Hand-authored product guides, concepts, CLI, AI-integration, security and
  architecture pages.
- Generated package reference under `packages/<slug>/`.
- Site assets, screenshots and `docs.json`.

Contributor and engineering documentation lives in the root
[`docs/`](https://github.com/marrrkkk/stacknext/blob/main/docs/README.md). Do
not duplicate it here.

## Rules

- `docs.json` owns navigation, redirects, navbar, SEO and
  `markdown.instructions`. Every local navigation entry must resolve, have
  `title` and `description` frontmatter, and appear only once.
- Package reference is canonical in `packages/<package>/docs/`. Never edit
  `apps/docs/packages/` by hand; edit the canonical file and run
  `pnpm docs:sync`. Every generated package page must be in the Packages
  navigation.
- Keep public URLs stable. When a public page moves, add a redirect in
  `docs.json`. Engineering docs are linked with absolute GitHub URLs, not
  relative paths outside this Mintlify root.
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
