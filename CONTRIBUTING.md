# Contributing to StackNext

Thanks for helping improve StackNext. This project is local-first, privacy
sensitive and pre-1.0, so small, well-tested changes with clear evidence are
more useful than broad rewrites.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Security issues must be reported privately through [SECURITY.md](SECURITY.md),
not in a public issue.

## Before you start

- Read [AGENTS.md](AGENTS.md), [the engineering docs](docs/README.md) and
  [architecture boundaries](docs/architecture/boundaries.md). The architecture
  invariants are part of the review.
- Check existing issues and pull requests to avoid duplicate work.
- For a large feature or a package-boundary change, open an issue first and
  describe the evidence it will expose.
- Do not include customer data, captured telemetry, tokens or credentials in an
  issue, test fixture or pull request.

## Development setup

Requirements:

- Node.js 24, pinned in `.nvmrc`; current 24.x releases bundle Corepack 0.36,
  which was verified with pnpm 12.16.1. Node.js 22 works after updating Corepack
  to 0.36 or newer. The published engine minimum is `>=20.9.0`.
- pnpm 12.16.1. The version is pinned by `packageManager`; use Corepack rather
  than installing a global pnpm.
- Playwright Chromium for the example app and e2e checks.

```bash
git clone https://github.com/marrrkkk/stacknext.git
cd stacknext
nvm use                  # or the equivalent for fnm, asdf or mise
corepack enable          # activates pnpm 12.16.1 from package.json
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
```

On Linux, use `pnpm exec playwright install --with-deps chromium` to install the
browser's system libraries as well; that step needs root or sudo. On macOS and
Windows the plain `install chromium` is enough.

If `corepack enable` cannot write to the Node.js install directory, prefix every
pnpm command with `corepack`:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
corepack pnpm build
```

Alternatively, install the pinned version directly with
`npm install --global pnpm@12.16.1`. If the Corepack bundled with your Node.js
release does not recognize pnpm 12, update Corepack first
(`npm install --global corepack@latest`) or use Node.js 24. Confirm `node -v`
and `pnpm -v` match the pinned versions before opening a pull request.

### Container development

VS Code Dev Containers and the Dev Containers CLI can open the repository with
`.devcontainer/`. The image includes Node 24, pnpm 12.16.1 and Playwright
Chromium, and runs `pnpm install --frozen-lockfile` when the container is
created. In VS Code, ports 4400 (collector and dashboard) and 4402 (example
app) are forwarded to loopback.

GitHub Codespaces is not supported: browser-forwarded URLs use `app.github.dev`
Host headers, which the collector intentionally rejects. Use a local container
instead.

The container already provides the toolchain, so skip `nvm use`,
`corepack enable`, `pnpm install` and the Playwright install step. Run the build
and checks directly:

```bash
pnpm build
pnpm test
```

In VS Code, do not use `stacknext dev --open` inside the container; open the
forwarded dashboard URL instead. The Dev Containers CLI does not apply
`forwardPorts`, so a CLI session reaches the dashboard only inside the container
unless you map port 4400 yourself. The container does not mount the Docker
socket. Native Node remains the canonical development and test path; the dev
container is a convenience for reproducible setup.

Useful commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:packages
pnpm test:consumer --next 16.4.3 --pm npm --skip-build
pnpm check:docs
pnpm changelog:check
pnpm benchmark
pnpm benchmark:diagnostics
pnpm benchmark:verbose
```

The e2e suite starts the built example app and checks the real CLI, collector,
dashboard, MCP server, diagnostics and capture → baseline → candidate → compare
flow. It reuses a live runtime when one is already running.

## What to change

- Keep changes consistent with the existing package layout, naming and style.
- `core` is the base package. Do not import CLI, Next.js, React, Playwright or
  adapter code from it.
- Validate external data with Zod at the boundary. Do not use `any` in new code.
- Instrumentation must never block a request on network I/O.
- Preserve the two-layer redaction boundary. A new captured field requires
  app-side redaction, collector-side redaction, privacy documentation and tests
  that assert secrets do not appear in API, export or regression output.
- Diagnostics must remain deterministic, bounded and evidence-backed. Never
  describe a heuristic as a confirmed root cause.
- Regression comparisons must remain deterministic and report-only. Do not add
  statistical-significance or causality claims.
- MCP tools must stay read-only, loopback-only and compatible with the existing
  tool names and arguments.
- Keep Playwright optional and captured runs sequential.
- Never overwrite a user's `instrumentation.ts`, middleware, proxy or
  `next.config`.
- Keep the collector bound to loopback and preserve Host/Origin/CSP checks.

## Tests

Tests should exercise real behavior: a real transport, a real collector or a
real fixture where practical. Do not mock the code under test merely to make a
test pass.

Add or update tests for:

- schema, redaction and normalization changes;
- CLI behavior, JSON output and exit codes;
- dashboard routes and deep links;
- MCP tool contracts, prompts and read-only annotations;
- package archives and external consumer installs when packaging changes;
- Windows process cleanup when changing `stacknext dev` or `uninstall`.

Before opening a pull request, run the full verification sequence from
[AGENTS.md](AGENTS.md#verification). If a check cannot run on your machine, say
which one and why in the pull request.

## Documentation

- Public product docs live in `apps/docs/`. Update the relevant page and its
  navigation entry when user-visible behavior changes.
- Contributor and engineering docs live in `docs/`. Update the relevant page
  when the build, test, release or architecture process changes.
- Package reference is canonical in `packages/<package>/docs/` and ships in the
  npm archive. The CLI package index is generated; edit the canonical file and
  run `pnpm docs:sync`. The public Mintlify guide is hand-authored and does not
  copy package docs.
- Keep examples copy-pasteable and free of fake production URLs or credentials.
- Use the documented brand and identifiers only: `StackNext`, `stacknext`,
  `@stacknext/*`, `STACKNEXT_*`, `stacknext.config.json` and `.stacknext`.
- Run `pnpm check:docs` before submitting.
- After editing `CHANGELOG.md`, run `pnpm changelog:sync` so the website
  changelog data matches. Never edit `apps/www/content/changelog.generated.ts`
  by hand.
- Regenerate screenshots if the dashboard changed. Do not commit screenshots
  that show another product, a token, a customer route or unredacted data.
- See [documentation architecture](docs/development/documentation.md) for the
  full source-of-truth and validation rules.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) for commits
and pull request titles:

```text
<type>(<scope>): <imperative summary>
```

`feat` adds a user-visible capability and requests a minor release; `fix`,
`perf` and `revert` request a patch. `docs`, `test`, `chore`, `ci`, `build` and
`refactor` do not release on their own. Mark breaking changes with `!` or a
`BREAKING CHANGE:` footer. Keep the subject imperative, lowercase after the
colon, without a trailing period, and at most 72 characters. Scopes are
optional but preferred, for example `cli`, `core`, `dashboard`, `docs`,
`release` or `www`.

See [repository conventions](docs/development/repository-conventions.md#commit-messages)
for examples and the full rules.

## Pull requests

`main` uses squash merge, so the pull request title becomes the commit on
`main` and drives release planning. Make it a valid Conventional Commit.

A good pull request:

- explains the problem and the user-visible behavior;
- keeps the diff focused;
- lists the exact verification commands and results;
- includes tests for new behavior and regression tests for fixes;
- documents privacy, compatibility or release implications;
- does not include generated `dist`, `.next`, `.stacknext` or `release` output.

Use [the pull request template](.github/pull_request_template.md) and fill
every section. State which checks could not run and why. Maintainers may ask
for a narrower diff, a real reproduction or additional evidence before
merging.

## Versioning and releases

Only maintainers release packages. Do not edit versions, create tags, publish to
npm or push release commits unless you are coordinating a release. See
[release process](docs/deployment/release-process.md).

## License

Contributions are licensed under the project's [MIT License](LICENSE). There is
no separate contributor license agreement.
