# Documentation architecture

StackNext has four documentation surfaces with different jobs. Do not merge
them into one tree.

| Surface | Location | Audience | Source of truth |
| --- | --- | --- | --- |
| Public site | `apps/docs/` | Users and AI agents reading the published site | Hand-authored pages plus generated package copies |
| Engineering knowledge base | `docs/` (this directory) | Contributors and maintainers | Hand-authored pages |
| Package reference | `packages/<package>/docs/` | Consumers of an installed package and maintainers | Canonical package Markdown |
| Repository policy | root `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md` | Contributors and users | Hand-authored policy |

The public site is deployed independently from npm. The engineering docs are
never deployed by Mintlify. Package docs are included in npm archives and are
also copied into the public site.

## Canonical package docs

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
2. `apps/docs/packages/<package>/*.md` — Mintlify copies of the package docs.
3. `apps/docs/packages/.generated.json` — the list of generated files.

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

## Validation

```bash
pnpm check:docs
```

This runs both sync scripts in `--check` mode and then validates:

- `apps/docs/docs.json` schema, navigation targets, frontmatter, assets,
  duplicate entries and redirects;
- every relative and website-root Markdown link in the repository;
- heading anchors for local links;
- generated package copies, their marker and navigation presence;
- package `files` fields and required package docs;
- the CLI package index and `PACKAGE_DOCS` slug list;
- documented `pnpm` scripts against the root manifest;
- no manual `llms.txt`/`llms-full.txt` files;
- no legacy brand remains in text sources;
- the generated website changelog is current.

CI additionally runs from `apps/docs/`:

```bash
npx --yes mint@4.2.1165 validate --no-build --format json
npx --yes mint@4.2.1165 broken-links
```

## Adding a public page

1. Add it under `apps/docs/` with `title` and `description` frontmatter.
2. Add its extensionless path to the matching `navigation.groups` entry in
   `apps/docs/docs.json`.
3. Link to engineering docs with an absolute GitHub URL, not a relative path
   outside the Mintlify root. Relative links inside `apps/docs/` are fine.
4. Run `pnpm check:docs` and the Mintlify commands above.
5. If the page replaces a removed public page, add a redirect in
   `apps/docs/docs.json`.

## Adding an engineering page

1. Add it under the right directory in `docs/` with a clear title.
2. Link it from [`docs/README.md`](../README.md) and from related pages.
3. Keep it contributor-focused. Do not duplicate user guides that belong in
   `apps/docs/`.
4. Use relative links for repository files and GitHub URLs for external
   resources.
5. Run `pnpm check:docs`.

## Adding a package

1. Create `packages/<name>/docs/index.md` plus focused reference pages.
2. Add frontmatter with a title and description to every file.
3. Add `"docs"` to the package's `files` array.
4. Add the package to `DOCUMENTED_PACKAGES` in `scripts/lib/docs.mjs`.
5. Add generated pages to the Packages navigation in `apps/docs/docs.json`.
6. Add the required files to `required` in `scripts/lib/docs.mjs`; archive
   validation uses the same list for every documented package.
7. Run `pnpm docs:sync`, `pnpm check:docs` and `pnpm test:packages`.

## Required package pages

The sync script validates the files listed in
`scripts/lib/docs.mjs`. Each documented package must have an `index.md`; the
integration packages also have installation, configuration or troubleshooting
pages as appropriate.

## AI-readable docs

Mintlify generates `/llms.txt`, `/llms-full.txt` and Markdown page variants
(such as `/guides/diagnostics.md`). It also supports `Accept: text/markdown`
content negotiation and includes `markdown.instructions` from
`apps/docs/docs.json` in generated Markdown. Do not commit manual copies of
those generated files; `pnpm check:docs` rejects them.

The model instructions must keep the audience split clear: conceptual guides
live on the public site, package reference ships in the packages, and local
installed docs take precedence for API details.

## Agent-facing docs

The managed `AGENTS.md` block, the Agent Skill and the MCP server are updated
alongside the package docs. Keep the skill procedural and point it at package
references instead of copying API tables. The root repository `AGENTS.md`
documents contributor rules, not consumer APIs.

`skills/stacknext-debugging` is canonical. It is copied into
`packages/cli/skills/` at pack time by `scripts/sync-cli-skill.mjs`. Do not edit
the generated copy.

## Related

- [Engineering documentation index](../README.md)
- [Testing strategy](../testing/testing-strategy.md)
- [Package architecture](../architecture/packages.md)
- [Public docs README](../../apps/docs/README.md)
