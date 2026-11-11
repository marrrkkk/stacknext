# Scripts and tooling

The repository keeps verification and release automation in `scripts/`. Most
scripts are plain Node ESM and are invoked through root `package.json` scripts.
They must work on Node.js 22, 24 and 26.

## Verification

| Script | Root command | Purpose |
| --- | --- | --- |
| `scripts/e2e.mjs` | `pnpm test:e2e` | Starts or reuses the real CLI, collector, example app, dashboard, MCP server and regression flow. Requires a build and Playwright Chromium. |
| `scripts/validate-packages.mjs` | `pnpm test:packages` | Packs every public archive, validates contents, exports, docs, permissions, forbidden files and secrets. |
| `scripts/consumer-smoke.mjs` | `pnpm test:consumer` | Installs the packed archives into an external Next.js app with npm or pnpm. |
| `scripts/benchmark.mjs` | `pnpm benchmark` | Synthetic ingest and read-API benchmark. |
| `scripts/benchmark-dashboard.mjs` | `pnpm benchmark:dashboard` | Built-dashboard live-refresh, long-task, heap, hidden-tab and bundle benchmark. |
| `scripts/benchmark-diagnostics.mjs` | `pnpm benchmark:diagnostics` | Synthetic findings and diagnostics read benchmark. |
| `scripts/benchmark-verbose.mjs` | `pnpm benchmark:verbose` | Real example-app standard versus verbose-tracing comparison. |
| `scripts/check-docs.mjs` | `pnpm check:docs` | Validates public docs, engineering docs, package docs, links, navigation, redirects and generated output. |
| `scripts/sync-docs.mjs` | `pnpm docs:sync` | Regenerates the installed CLI package-docs index. `--check` verifies staleness. |
| `scripts/sync-changelog.mjs` | `pnpm changelog:sync` | Generates `apps/www/content/changelog.generated.ts` from `CHANGELOG.md`. `--check` verifies staleness. |
| `scripts/sync-cli-skill.mjs` | `pnpm --filter @stacknext/cli prepack` | Copies the canonical Agent Skill into the CLI archive. `--clean` removes the copy. |

## Release

| Script | Root command | Purpose |
| --- | --- | --- |
| `scripts/plan-release.mjs` | `pnpm release:plan` | Computes the next version from Conventional Commits since the latest tag. |
| `scripts/prepare-release.mjs` | `pnpm release:prepare` | Writes the release version across packages and updates release metadata. |
| `scripts/pack-release.mjs` | `pnpm pack:release` | Builds the release archives and the validation manifest. |
| `scripts/release-notes.mjs` | `pnpm release:notes` | Produces release notes from the changelog and commits. |
| `scripts/publish-release.mjs` | `pnpm release:publish` | Publishes archives in dependency order with provenance and registry checks. |

Release scripts are maintainer-only. See
[release process](../deployment/release-process.md).

## Shared libraries

| Path | Responsibility |
| --- | --- |
| `scripts/lib/docs.mjs` | `DOCUMENTED_PACKAGES`, `DOCS_DIR`, redirect-destination parsing, generated-file constants. |
| `scripts/lib/changelog.mjs` | Changelog parsing and website rendering. |
| `scripts/lib/release.mjs` | Archive validation and package metadata checks. |
| `scripts/lib/versioning.mjs` | Conventional Commit parsing and bump rules. |

## Adding a script

1. Put reusable logic in `scripts/lib/` and test it with Vitest.
2. Add a root `package.json` script if contributors should run it directly.
3. Document the command, inputs, outputs and side effects in this page.
4. Keep output machine-readable with a `--json` flag when the result is
   consumed by CI or another script.
5. Do not write outside `release/`, `.stacknext/` or a documented output path.
   Never commit generated output.

## Related

- [Testing strategy](../testing/testing-strategy.md)
- [Documentation architecture](../development/documentation.md)
- [Release process](../deployment/release-process.md)
