---
title: Documentation conventions
description: The canonical package docs, generated website copies, CLI index and validation rules.
---

## One source per package

Canonical documentation lives next to the code:

```text
packages/<package>/docs/*.md
```

Those files are included in the npm archive via the package's `files` field.
They use plain Markdown with `title` and `description` frontmatter, relative
links and no Mintlify-only components, so they remain readable in GitHub, npm,
an editor and on the website.

## Generated outputs

`node scripts/sync-docs.mjs` (or `pnpm docs:sync`) produces:

1. `packages/cli/docs/packages.md` — the local documentation index shipped in
   the CLI archive.
2. `docs/packages/<package>/*.md` — Mintlify copies of the package docs.
3. `docs/packages/.generated.json` — the list of generated files.

Generated copies carry an MDX-safe generated marker comment after the
frontmatter and drop the duplicate H1. Do not edit them; edit the canonical
file and rerun the script. The script removes only files listed in its manifest,
so hand-authored pages are never deleted.

`node scripts/sync-changelog.mjs` (or `pnpm changelog:sync`) generates
`apps/www/content/changelog.generated.ts` from the root `CHANGELOG.md`. The
website changelog imports that module; never edit it by hand. The generator
excludes `[Unreleased]`, requires dated release headings, and rejects structure
it cannot render faithfully, such as fenced code blocks, nested bullets and
relative links.

`pnpm check:docs` runs both sync scripts in `--check` mode and then validates
links, frontmatter and navigation. CI also validates the Mintlify site with
`mint validate --no-build` and `mint broken-links` from `docs/`.

## Website pages

Hand-authored website pages live under `docs/` with the structure in
`docs/docs.json`. The package section is generated; everything else is
editorial. When adding a page:

1. Add it under the right directory with frontmatter.
2. Add its extensionless path to the matching `navigation.groups` entry.
3. Run `pnpm docs:check`.
4. Make sure every link resolves and every nav entry exists.

Mintlify generates `llms.txt` and `llms-full.txt` automatically; do not create
manual copies. `.md` pages are served as Markdown automatically.

## Adding a package

1. Create `packages/<name>/docs/index.md` plus focused reference pages.
2. Add frontmatter with a title and description to every file.
3. Add `"docs"` to the package's `files` array.
4. Add the package to `DOCUMENTED_PACKAGES` in `scripts/lib/docs.mjs`.
5. Add generated pages to the Packages navigation in `docs/docs.json`.
6. Add the required files to `required` in `scripts/lib/docs.mjs`; archive
   validation uses the same list for every documented package.
7. Run `pnpm docs:sync`, `pnpm check:docs` and `pnpm test:packages`.

## Required package pages

The sync script validates the files listed in
`scripts/lib/docs.mjs`. Each documented package must have an `index.md`; the
integration packages also have installation, configuration or troubleshooting
pages as appropriate.

## Agent-facing docs

The managed `AGENTS.md` block, the Agent Skill and the MCP server are updated
alongside the package docs. Keep the skill procedural and point it at package
references instead of copying API tables. The root repository `AGENTS.md`
documents contributor rules, not consumer APIs.

## Related

- [Contributing](index)
- [Testing](testing)
- [Package architecture](../architecture/packages)
