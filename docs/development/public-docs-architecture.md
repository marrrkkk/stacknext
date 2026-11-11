# Public documentation architecture

This page records why the public Mintlify guide has its current shape. It is a
contributor document, not user-facing documentation.

## Research summary

The guide was benchmarked against the public documentation of Playwright,
Sentry, PostHog, Prisma, Vitest, Vercel, Drizzle, Better Auth and Hono. The
adopted patterns are:

- **One obvious getting-started path.** A short installation page followed by a
  quickstart that ends with a visible first result. Prerequisites live inside
  installation instead of a separate page.
- **Product guides separate from reference.** Narrative workflows live in
  `Guides` and `Integrations`; exhaustive command, configuration and protocol
  facts live in `Reference`. This follows Vitest, Prisma and Hono.
- **Integrations are first-class but few.** Only implemented integrations get a
  page. Drizzle and Prisma share one page because the task (add database query
  evidence) is the same.
- **AI-agent support is one section, not one page per client.** Shared setup and
  the evidence contract are explained once; client-specific snippets are
  subsections.
- **No contributor documentation in the product guide.** Contributing, build,
  test, release, benchmark and internal architecture material lives in the
  repository knowledge base and policy files.
- **Package reference is versioned and lives with the package.** The website
  links to the installed reference instead of duplicating every package page.
- **Short pages, task headings, runnable snippets and a "Related" list.** Pages
  avoid repeated introductions and marketing filler.
- **Stable URLs with redirects.** Removed and merged pages redirect to the
  closest surviving destination, not to the homepage.

## Page inventory decisions

| Previous page | Decision | New location |
| --- | --- | --- |
| `index` | Rewrite | `index` |
| `overview/what-is-stacknext` | Rewrite | `overview/what-is-stacknext` |
| `overview/core-concepts` | Keep, update links | `overview/core-concepts` |
| `limitations` | Keep, trim contributor material | `limitations` |
| `installation` | Rewrite and absorb requirements/uninstall | `installation` |
| `getting-started/requirements` | Merge | `installation` |
| `getting-started/quickstart` | Rewrite | `getting-started/quickstart` |
| `getting-started` | Remove grab-bag page | Redirect to quickstart |
| `getting-started/first-app` | Merge | `getting-started/quickstart` |
| `getting-started/configuration` | Rewrite as reference | `reference/configuration` |
| `compatibility` | Keep, trim | `compatibility` |
| `guides/runtime-evidence` | Rewrite | `guides/runtime-evidence` |
| `guides/diagnostics` | Rewrite | `guides/diagnostics` |
| `guides/snapshots` | Keep, update links | `guides/snapshots` |
| `guides/regression` | Merge | `regression-testing` |
| `regression-testing` | Rewrite as the single workflow | `regression-testing` |
| `baselines` | Merge | `regression-testing#baselines` |
| `comparison-methodology` | Merge | `regression-testing#comparison-methodology` |
| `ci-integration` | Keep, trim | `ci-integration` |
| `playwright-integration` | Keep, rewrite details | `playwright-integration` |
| `guides/nextjs` | Move | `integrations/nextjs` |
| `guides/database` | Merge | `integrations/database` |
| `custom-instrumentation` | Rewrite and absorb Server Actions | `custom-instrumentation` |
| `server-actions` | Merge | `custom-instrumentation#server-actions` |
| `instrumentation-coverage` | Keep, update links | `instrumentation-coverage` |
| `cli/index` | Merge | `cli/commands` |
| `cli/commands` | Rewrite as full reference | `cli/commands` |
| `cli/agent-setup` | Merge | `ai-agents/setup` |
| `mcp` | Rewrite as setup; detail moved | `mcp` and `reference/mcp-tools` |
| `packages/*` (generated) | Remove from public site | Package-local docs and `reference/packages` |
| `ai-agents/index` | Rewrite | `ai-agents/index` |
| `ai-agents/agents-md` | Merge | `ai-agents/setup` |
| `ai-agents/skill` | Merge | `ai-agents/setup#agent-skill` |
| `ai-agents/supported-agents` | Merge | `ai-agents/setup#supported-clients` |
| `ai-agents/llms-txt` | Merge | `ai-agents/local-docs#ai-readable-documentation` |
| `ai-agents/workflows` | Keep, update links | `ai-agents/workflows` |
| `ai-agents/local-docs` | Keep, update links | `ai-agents/local-docs` |
| `integrations/agent-instructions` | Merge | `ai-agents/setup` |
| `integrations/opencode` | Merge | `ai-agents/setup#opencode` |
| `integrations/codex` | Merge | `ai-agents/setup#codex` |
| `integrations/claude-code` | Merge | `ai-agents/setup#claude-code` |
| `security/data-collection` | Merge | `privacy#what-stacknext-collects` |
| `security/redaction` | Merge | `privacy#redaction` |
| `security/retention` | Merge | `privacy#retention` |
| `privacy` | Rewrite as one page | `privacy` |
| `architecture` | Remove from public docs | Engineering architecture |
| `architecture/packages` | Remove from public docs | Engineering package architecture |
| `architecture/boundaries` | Remove from public docs | Engineering boundaries |
| `contributing/index` | Remove from public docs | `CONTRIBUTING.md` |
| `uninstall` | Merge | `installation#remove-stacknext` |
| `reference/mcp-tools` | Add | `reference/mcp-tools` |
| `reference/packages` | Add | `reference/packages` |

## Structural decisions

### Keep `apps/docs` as the Mintlify directory

The deployment is already configured to use `/apps/docs` as the Mintlify
subdirectory. Moving the site would require a dashboard change for no user
benefit. The directory and `docs.json` stay where they are.

### Remove generated package copies

The site previously generated 43 package-scoped pages from `packages/*/docs` and
required them in navigation. That duplicated version-specific reference on a
site that cannot track every installed version. The canonical files already ship
inside each npm archive and are discoverable through the installed CLI index.

The public site now:
- lists only directly installed packages on `reference/packages`;
- explains how to find local package docs;
- keeps every internal package reference out of the public navigation.

The generated artifact that remains is `packages/cli/docs/packages.md`, which is
the installed-package index inside the CLI archive.

### Consolidate regression into one guide

Capture, baselines and comparison methodology are one workflow. Splitting them
produced three pages with duplicated storage and status explanations. The single
guide keeps deep anchors (`#baselines`, `#comparison-methodology`) so old links
can redirect without losing context.

### Keep privacy as one page

Data collection, redaction and retention are facets of one boundary. One page
makes the "what is collected → how it is redacted → when it is deleted" sequence
readable and removes repetition. Old security URLs redirect to the relevant
headings.

## Reference migration

Repository references were migrated by meaning, not by global replacement:

- package READMEs now point at the production documentation site;
- package docs that referred to removed website pages point at the consolidated
  page or section;
- the root README, `SUPPORT.md`, `CONTRIBUTING.md`, `AGENTS.md`, engineering
  docs and the Agent Skill point at surviving paths;
- `apps/www` links to the production documentation site;
- JSDoc and source comments contain no documentation URLs that need migration.

## Validation

- `pnpm check:docs` validates navigation, local links, anchors, redirects,
  absolute production URLs, package docs and generated output.
- CI runs `mint validate --no-build` and `mint broken-links` from `apps/docs`.
- `pnpm test:packages` validates the npm archives, including bundled docs.

## Related

- [Documentation architecture](documentation.md)
- [Engineering documentation index](../README.md)
- [Public docs README](../../apps/docs/README.md)
