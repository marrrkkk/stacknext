# Documentation architecture

StackNext has four documentation surfaces with different jobs. Do not merge
them into one tree.

| Surface | Location | Audience | Source of truth |
| --- | --- | --- | --- |
| Public site | `apps/docs/` | Developers using StackNext and AI agents reading the published site | Hand-authored pages only |
| Engineering knowledge base | `docs/` (this directory) | Contributors and maintainers | Hand-authored pages |
| Package reference | `packages/<package>/docs/` | Consumers of an installed package and maintainers | Canonical package Markdown |
| Repository policy | root `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md` | Contributors and users | Hand-authored policy |

The public site is deployed independently from npm. The engineering docs are
never deployed by Mintlify. Package docs ship in npm archives and are not copied
into the public site. Hand-authored public pages use `.mdx` so they can use
Mintlify components; canonical package docs stay `.md` because they must remain
readable outside Mintlify.

## Public site scope

The public guide answers product questions: what StackNext is, how to install
and configure it, how to use each feature, how to integrate it, how to work with
AI agents, how to troubleshoot and what happens to data.

It does not contain repository development material. Build commands, internal
test and release workflows, contribution rules, package-boundary decisions,
internal architecture and ADRs belong in `docs/` or the root policy files. See
[public documentation architecture](public-docs-architecture.md) for the
research, page inventory and structural decisions behind the current guide.

## Canonical package docs

Canonical documentation lives next to the code:

```text
packages/<package>/docs/*.md
```

Those files are included in the npm archive via the package's `files` field.
They use plain Markdown with `title` and `description` frontmatter, relative
links and no Mintlify-only components, so they remain readable in GitHub, npm,
an editor and on the website when rendered by the client. Do not convert
canonical package docs to `.mdx`, and do not copy them into `apps/docs`.

## Generated outputs

`node scripts/sync-docs.mjs` (or `pnpm docs:sync`) produces one file:

- `packages/cli/docs/packages.md` — the installed-package index shipped in the
  CLI archive, listing each documented package, its version, visibility, role
  and local documentation path.

Do not edit it; edit the canonical package docs or `scripts/lib/docs.mjs` and
rerun the script.

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
  duplicate entries, redirects and redirect heading anchors;
- every relative and website-root Markdown/MDX link in the repository;
- heading anchors for local links;
- absolute `https://stack-next.mintlify.site` URLs against navigation,
  configured redirects and their heading anchors;
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

1. Add it under `apps/docs/` as an `.mdx` page with `title` and `description`
   frontmatter.
2. Add its extensionless path to the matching `navigation.groups` entry in
   `apps/docs/docs.json`.
3. Link to engineering docs with an absolute GitHub URL, not a relative path
   outside the Mintlify root. Relative links between public pages are
   extensionless, for example `../mcp`.
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
5. Add the required files to `required` in `scripts/lib/docs.mjs`; archive
   validation uses the same list for every documented package.
6. Add a row to the public [packages reference](../../apps/docs/reference/packages.mdx)
   only if developers install the package directly.
7. Run `pnpm docs:sync`, `pnpm check:docs` and `pnpm test:packages`.

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

- [Public documentation architecture](public-docs-architecture.md)
- [Engineering documentation index](../README.md)
- [Testing strategy](../testing/testing-strategy.md)
- [Package architecture](../architecture/packages.md)
- [Public docs README](../../apps/docs/README.md)
