# Releasing StackNext

Releases are manual. Nothing in this repository tags, commits, pushes or
publishes on a schedule or on a normal branch push. The release workflow is
started by a maintainer with an explicit version, runs the full gate set, and
publishes only after environment approval.

## Release model

- All ten public packages share one version. Version alignment is enforced by
  `scripts/pack-release.mjs` and `packages/cli/test/version.test.ts`.
- Package archives are built with `pnpm pack`, which rewrites `workspace:*`
  dependencies to the exact release version. Published packages must never
  contain a `workspace:` range.
- Publishing order follows the dependency graph:
  `core`, `diagnostics`, `regression`, `next`, `drizzle`, `prisma`,
  `playwright`, `mcp`, `dashboard`, `@stacknext/cli`.
- Normal releases use GitHub Actions OIDC with npm trusted publishing and
  provenance. No long-lived npm token is stored in the repository.
- npm releases are immutable. If a release is wrong, publish a fixed patch and
  deprecate the broken version; do not unpublish.
- The very first publication of a package is the one exception: npm cannot
  configure a trusted publisher for a package that does not exist yet. See
  [First-release bootstrap](#first-release-bootstrap).

## One-time repository setup

The repository is `https://github.com/marrrkkk/stacknext`. Confirm it exists,
is public, and uses `main` as its default branch before the first push. All
package manifests, README files and policy documents must point at that
repository; trusted publishing and provenance reject mismatched metadata.

Before the first release:

1. Create the repository and push `main`. Do not publish from a fork.
2. Enable GitHub Discussions and private vulnerability reporting.
3. Protect `main`: require pull requests, the CI workflow, and a linear history.
   Do not allow force pushes.
4. Create an `npm` environment under **Settings → Environments** with required
   reviewers and a deployment branch rule limited to `main`.
5. Leave repository Actions permissions at read-only by default. The release
   workflow requests `id-token: write` explicitly for the publish job.
6. Confirm that `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md` and
   `.github/ISSUE_TEMPLATE/config.yml` use the real repository and contact
   links.

## First-release bootstrap

Trusted publishing is configured from an existing package page, so the first
publication of every package needs an authenticated npm session. This is a
one-time exception for `0.6.0`; later releases must use the GitHub Actions
workflow.

### Confirm npm ownership

Run these checks before touching the version or packing archives:

```bash
npm login
npm whoami
npm view @stacknext/cli version
npm view @stacknext/core version
```

A `404` for the packages means npm does not show a published version. Confirm
that the names are genuinely unclaimed in the npm website search and that your
account owns, or belongs to, the `@stacknext` scope. If the scope is owned by an
organization, create or join it before publishing; an npm scope cannot be
renamed after publication without a breaking package rename. Never publish a
name you do not control.

The account must have two-factor authentication enabled. Publishing from the
CLI uses the local npm session and does not put a token in the repository.

### Publish 0.6.0 locally

Run the complete gate list first, then dry-run the publisher:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm release:publish --version 0.6.0 --dry-run
```

The dry run packs all ten archives, validates them, checks the registry and runs
`npm publish --dry-run` for each tarball. When it passes, publish from an
authenticated local session:

```bash
pnpm release:publish --version 0.6.0 --publish --allow-local-publish
```

`--allow-local-publish` is the explicit bootstrap escape hatch. Without it the
publisher refuses to publish outside GitHub Actions. The worktree must be clean.
Local publishing cannot generate npm provenance, so the bootstrap `0.6.0`
packages are unsigned; this is why trusted publishing must be configured
immediately afterwards. A partial failure can be resumed with
`--resume` (or `--only-missing`), which skips packages already visible at the
exact version.

### Configure trusted publishing for all ten packages

For each package page on npmjs.com, open **Settings → Trusted Publisher** and
add a GitHub Actions publisher:

| Field | Value |
| --- | --- |
| Organization or user | `marrrkkk` |
| Repository | `stacknext` |
| Workflow filename | `release.yml` |
| Environment | `npm` |

Select **Allow npm publish** so the workflow can publish directly. If the
setting is left at staged publishing, the workflow fails and must be changed to
`npm stage publish` with a separate approval step. Repeat the configuration for:

| Package |
| --- |
| `@stacknext/cli` |
| `@stacknext/core` |
| `@stacknext/diagnostics` |
| `@stacknext/regression` |
| `@stacknext/next` |
| `@stacknext/drizzle` |
| `@stacknext/prisma` |
| `@stacknext/playwright` |
| `@stacknext/mcp` |
| `@stacknext/dashboard` |

With npm 11.15 or newer, the same relationship can be created from a terminal:

```bash
for package in @stacknext/cli @stacknext/core @stacknext/diagnostics \
  @stacknext/regression @stacknext/next @stacknext/drizzle @stacknext/prisma \
  @stacknext/playwright @stacknext/mcp @stacknext/dashboard; do
  npm trust github "$package" \
    --file release.yml \
    --repo marrrkkk/stacknext \
    --environment npm \
    --allow-publish \
    --yes
done
```

Do not add an `NPM_TOKEN` secret. Trusted publishing uses the workflow's
`id-token: write` permission. The runner needs npm 11.5.1 or newer; the release
workflow enforces that version before its gates run. Managing the configuration
from a terminal with `npm trust` requires npm 11.15.0 or newer.

Verify the publisher configuration on each package page and with
`npm view <package>@<version> version` before making the next release.

## Prepare the version

1. Start from a clean, reviewed commit on `main`. Do not release from a dirty
   worktree or a feature branch.
2. Update every public package version, the root version, the example app
   version, `CLI_VERSION` in `packages/cli/src/version.ts` and
   `STACKNEXT_SDK_VERSION` in `packages/core/src/types.ts`.
3. Update `CHANGELOG.md`. Include breaking changes, renamed packages, new
   commands, privacy changes and any known limitations.
4. Update `docs/compatibility.md` with the Node.js, Next.js, package manager and
   OS combinations actually validated for this version.
5. Regenerate screenshots if the UI changed. Captures must show StackNext, not
   an older brand.
6. Run `pnpm install` and commit the lockfile change with the version bump.

Helpful checks:

```bash
node -e "for (const f of require('fs').readdirSync('packages')) console.log(f, require('./packages/'+f+'/package.json').version)"
pnpm exec vitest run packages/cli/test/version.test.ts
```

## Run the release gates

From the repository root, with Playwright Chromium installed:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm lint
pnpm typecheck
pnpm check:docs
pnpm test
pnpm build
pnpm test:packages
pnpm test:e2e
pnpm benchmark
pnpm benchmark:diagnostics
pnpm audit --prod
```

`pnpm test:packages` packs and inspects the real archives. It fails on version
drift, unresolved `workspace:` ranges, missing exports/declarations, missing
README/LICENSE, a missing edge-safe entry for `@stacknext/next`, a
non-executable CLI bin, forbidden files, detected secrets or an archive over
25 MiB. It also writes `release/validation/manifest.json`.

`pnpm audit --prod` must be reviewed before publishing. A release does not
proceed with a known production vulnerability that affects a published package.

### External consumer matrix

The release gate runs the full 12-combination matrix in
`.github/workflows/release.yml` before the publish job can start:

| Node.js | Next.js | npm | pnpm |
| --- | --- | --- | --- |
| 22 | 16.4.3 | Yes | Yes |
| 22 | 15.5.28 | Yes | Yes |
| 24 | 16.4.3 | Yes | Yes |
| 24 | 15.5.28 | Yes | Yes |
| 26 | 16.4.3 | Yes | Yes |
| 26 | 15.5.28 | Yes | Yes |

Reproduce at least the primary combinations locally:

```bash
pnpm test:consumer --next 16.4.3 --pm npm --skip-build
pnpm test:consumer --next 16.4.3 --pm pnpm --skip-build
pnpm test:consumer --next 15.5.28 --pm npm --skip-build
pnpm test:consumer --next 15.5.28 --pm pnpm --skip-build
```

Each run installs only the packed archives into a temporary Next.js app, then
checks `init`, idempotent re-init, `doctor`, dashboard assets, real telemetry,
`status`, `coverage`, `diagnose`, MCP, clean shutdown and `uninstall`. The
scheduled compatibility workflow repeats the full matrix weekly; it is not a
substitute for the release gate.

## Build and inspect the archives

```bash
pnpm pack:release
```

Outputs go to `release/` with a `manifest.json` containing SHA-256 and SHA-512
integrity values. Inspect the printed sizes and file counts. `release/` is
ignored by Git and is never committed.

Smoke-test the archives exactly as a pre-publication user would, with all ten
local tarballs installed together:

```bash
rm -rf /tmp/stacknext-archive-smoke
mkdir -p /tmp/stacknext-archive-smoke
cd /tmp/stacknext-archive-smoke
npm init -y
npm install /path/to/stacknext/release/*.tgz
npx stacknext --version
npx stacknext doctor
```

Installing only `stacknext-cli-0.6.0.tgz` fails before publication because its five
`@stacknext/*@0.6.0` dependencies are not in the registry yet. Install the whole
archive set, or use `pnpm test:consumer`, which does this automatically.

## Dry-run the publisher

```bash
pnpm release:publish --version 0.7.0 --dry-run
```

Dry-run is the default, so `--dry-run` is optional but explicit is better in
automation. Unless `--skip-gates` is passed, the publisher runs lint, typecheck,
tests, build, docs checks, e2e, both benchmarks and the production audit before
packing. It then validates the archives, checks the registry for an existing
version, prints the publish order and runs `npm publish --dry-run` for each
tarball. It does not create a tag or upload anything.

Real publishing requires `--publish`. Outside GitHub Actions it additionally
requires `--allow-local-publish`, which exists only for the first-release
bootstrap. `--resume` (alias `--only-missing`) skips packages that already exist
at the exact version. The publisher never overwrites an existing version and
never creates tags, commits or GitHub releases.

## Publish with the manual workflow

After the bootstrap, this is the only supported publication path.

1. Open **Actions → Release → Run workflow** on `main`.
2. Enter the exact version (for example `0.7.0`).
3. Leave **dry run** enabled for the first run.
4. Approve the `npm` environment when prompted.
5. Run again with **dry run** disabled and type `publish` in the confirmation
   field.
6. Enable **resume** only when recovering from a partial release. It skips
   packages already published at that exact version.
7. Approve the protected `npm` environment.

The workflow refuses to run unless `github.ref` matches the repository's default
branch. The publish job waits for all 12 consumer-matrix jobs and then:

- checks out the default branch;
- enforces npm 11.5.1 or newer and the exact requested version in every manifest
  and constant;
- installs with the frozen lockfile;
- runs the production audit, lint, typecheck, docs checks, tests, build, archive
  validation, e2e and both benchmarks;
- packs and validates the archives;
- publishes in dependency order with npm trusted publishing and provenance;
- verifies that every version exists in the registry, retrying for up to 120
  seconds per package because npm replicas can lag a successful publish
  (`STACKNEXT_REGISTRY_WAIT_MS` overrides the wait).

It does not push commits, create tags or create a GitHub release.

## Docker image publishing

Every release publishes the collector/dashboard image to GitHub Container
Registry as:

```text
ghcr.io/<repository-owner>/stacknext:<version>
```

`@stacknext/cli` derives the same reference from its package repository
metadata, so `stacknext dev --docker` pulls the image that matches the
installed CLI version. The image contains the built collector, dashboard assets
and the `docker-entrypoint.js` entrypoint. The CLI package is present only to run
that collector entrypoint; Next.js, Playwright, MCP data and project files are
not included.

### One-time GHCR setup

The release workflow authenticates with the repository `GITHUB_TOKEN`, so no
extra secret is required. Before the first Docker release:

1. Confirm the workflow's `docker-publish` job has `packages: write`. The
   repository-level default can stay read-only; the job requests the permission
   explicitly.
2. Publish the first image, then open the package page under the repository
   owner's **Packages** tab.
3. Set the package visibility to **Public** if users should pull it
   anonymously. This is a one-time GitHub package setting, not something the
   workflow can change. A private package requires every user to run
   `docker login ghcr.io` before `stacknext dev --docker`.
4. Check that the package is linked to the `stacknext` repository so its
   provenance and source links point at the right commit.

### Tags and platforms

| Image tag | When it is published |
| --- | --- |
| `<version>` | Every non-dry-run release, for example `0.7.0` |
| `latest` | Stable releases only; versions containing `-` do not move `latest` |

Images are built for `linux/amd64` and `linux/arm64` with Buildx and pushed as
a multi-platform manifest. The workflow also publishes provenance attestations.
The image is based on `node:24-alpine` and runs as the non-root `node` user by
default. At runtime the CLI passes the host uid/gid on POSIX so the read-only
`.stacknext` mount stays readable, and refuses to run as root.

### Workflow sequence

The release workflow has two Docker jobs:

- `docker-build` runs after the compatibility matrix and before `publish`. It
  builds the production image, loads it into the runner and runs
  `scripts/docker-integration.mjs --require-docker`. A failed build or
  integration check stops the release before any npm package is published.
- `docker-publish` runs after the npm publish job, and only when **dry run** is
  disabled. It logs in to GHCR, builds both platforms and pushes the version
  tag, plus `latest` for a stable version. A failed push fails the workflow.

The PR CI workflow runs the same image build and integration test without
pushing. It does not require a registry login.

Dry runs build and test the image but do not push it. They therefore prove that
the Dockerfile and runtime checks pass, not that the GHCR package is public or
that a tag was created.

### Manual verification and recovery

After a release, verify the published tags and platform manifest:

```bash
docker buildx imagetools inspect ghcr.io/marrrkkk/stacknext:0.7.0
docker pull ghcr.io/marrrkkk/stacknext:0.7.0
```

Then run the integration check against the pulled image:

```bash
node scripts/docker-integration.mjs \
  --image ghcr.io/marrrkkk/stacknext:0.7.0 \
  --require-docker
```

If `docker-publish` fails after npm succeeded, fix the workflow or registry
permission and re-run the failed job. Do not re-publish the npm packages. If a
wrong image was pushed under an existing version tag, rebuild and push the
correct image from the same commit; GHCR tags are mutable, unlike npm versions.
Record the reason in the release notes. If the image cannot be repaired, publish
a patch release and point users at the fixed version.

## After publishing

1. Compare the registry integrity values with the local release manifest:

   ```bash
   node --input-type=module -e "
     import { readFileSync } from 'node:fs'
     const manifest = JSON.parse(readFileSync('release/publish/manifest.json', 'utf8'))
     for (const pkg of manifest.packages) {
       const path = pkg.name.replace('/', '%2f')
       const response = await fetch('https://registry.npmjs.org/' + path + '/' + pkg.version)
       if (!response.ok) throw new Error(pkg.name + ': HTTP ' + response.status)
       const data = await response.json()
       if (data.dist.integrity !== pkg.integrity) {
         throw new Error(pkg.name + ': registry integrity does not match the manifest')
       }
       console.log(pkg.name, data.dist.integrity)
     }
   "
   ```

2. Install from the registry in a clean npm project outside the repository and
   repeat the quick start. This generates the npm lockfile needed for signature
   verification and proves that users are not relying on local archives:

   ```bash
   rm -rf /tmp/stacknext-registry-smoke
   mkdir -p /tmp/stacknext-registry-smoke
   cd /tmp/stacknext-registry-smoke
   npm init -y
   npm install @stacknext/cli@0.7.0 @stacknext/next@0.7.0
   npm audit signatures
   npx stacknext --version
   ```

   `npm audit signatures` verifies the installed dependency tree, not the pnpm
   repository. It is expected to report missing signatures for a locally
   bootstrapped `0.6.0`; every later release published through the workflow
   must have provenance and pass this check.

3. Inspect provenance metadata for a workflow-published version:

   ```bash
   npm view @stacknext/cli@0.7.0 dist.integrity dist.attestations
   ```

4. Tag the released commit and publish the GitHub release only after the
   registry verification passes:

   ```bash
   git tag -s v0.7.0 -m "StackNext 0.7.0"
   git push origin v0.7.0
   gh release create v0.7.0 --title "StackNext 0.7.0" --notes-file CHANGELOG.md
   ```

5. If npm shows a broken package, deprecate that exact version with a message
   pointing to the fixed patch. Do not unpublish; downstream lockfiles may still
   reference it.

## Versioning rules

- **Patch** for compatible fixes, documentation corrections and diagnostic
  threshold tuning that does not change the report contract.
- **Minor** for new tools, new adapters, new configuration fields or additive
  response metadata.
- **Major** for removed/renamed tools, changed wire formats, changed comparison
  semantics, dropped Next.js/Node.js support or a privacy-boundary change.

The project is pre-1.0, but a published minor still must document breaking
changes in the changelog and migration notes.

## Rollback

- Broken package contents: publish a patch, deprecate the broken version.
- Partial release: re-run the release workflow with **resume** enabled. It
  publishes only the missing packages, in dependency order, with provenance. As
  a last resort from an authenticated session, publish one archive directly:
  `npm publish release/publish/<tarball> --access public --tag latest`. That
  fallback has no provenance; record why it was needed.
- Missing package: publish the missing package at the same version, then verify
  the dependency range resolves.
- Wrong dist-tag: move the tag with `npm dist-tag add <package>@<version> latest`
  and verify with `npm view <package> dist-tags`.
- Security issue: follow [SECURITY.md](../SECURITY.md), publish a patched
  version, and deprecate affected versions with a clear upgrade instruction.

Never delete `.stacknext` records or rewrite a published package to hide a
problem. Keep the evidence and document the fix.
