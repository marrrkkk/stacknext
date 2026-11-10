# StackNext engineering documentation

This directory is the contributor and maintainer knowledge base. It documents
how the repository is built, tested, released and kept safe. It is not the
public product documentation.

The public Mintlify site lives in [`apps/docs/`](../apps/docs/README.md) and is
deployed separately. Package API reference is canonical in
`packages/<package>/docs/` and ships inside each npm archive.

## Start here

| Document | What it covers |
| --- | --- |
| [Architecture overview](architecture/overview.md) | Runtime processes, data flow, collector, store, diagnostics and storage. |
| [Package architecture](architecture/packages.md) | Package responsibilities, dependency direction and build topology. |
| [Architecture boundaries](architecture/boundaries.md) | The invariants that keep StackNext local, bounded and deterministic. |
| [Development environment](development/environment-setup.md) | Install, build, run the example app and preview the public site. |
| [Repository conventions](development/repository-conventions.md) | Source layout, build/typecheck split, code style and change rules. |
| [Documentation architecture](development/documentation.md) | Public site, engineering docs, package docs, generated copies and validation. |
| [Testing strategy](testing/testing-strategy.md) | Unit, e2e, archive, consumer and documentation checks. |
| [Benchmarks](testing/benchmarks.md) | Collector, diagnostics and verbose-tracing measurements and caveats. |
| [Agent compatibility](testing/agent-compatibility.md) | Recorded MCP and Agent Skill client checks. |
| [Release process](deployment/release-process.md) | Versioning, gates, archives, trusted publishing and rollback. |
| [Scripts and tooling](tooling/scripts.md) | Repository scripts, what they touch and when to run them. |
| [ADR 0001: native-only runtime](decisions/0001-native-only-runtime.md) | Why there is no managed container runtime. |
| [Dashboard layout specification](architecture/dashboard-layout.md) | Dashboard shell, navigation, page headers and interaction criteria. |

Repository-level policies live at the root:
[AGENTS.md](../AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md),
[SECURITY.md](../SECURITY.md), [SUPPORT.md](../SUPPORT.md),
[CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) and [CHANGELOG.md](../CHANGELOG.md).

## Source-of-truth map

| Content | Canonical location | Generated copies |
| --- | --- | --- |
| Public product guides and concepts | `apps/docs/**/*.md` | none |
| Package API reference | `packages/<package>/docs/**/*.md` | `apps/docs/packages/<slug>/` and `packages/cli/docs/packages.md` |
| Contributor and engineering docs | `docs/**/*.md` | none |
| Changelog | `CHANGELOG.md` | `apps/www/content/changelog.generated.ts` |
| Agent Skill | `skills/stacknext-debugging/` | `packages/cli/skills/` at pack time |
| Consumer agent instructions | `packages/cli/src/agents.ts` | managed `AGENTS.md` block in a consumer project |

Never edit a generated copy. Edit the canonical source and run
`pnpm docs:sync` or `pnpm changelog:sync`.

## Verification

```bash
pnpm check:docs
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:packages
```

`pnpm check:docs` validates the public Mintlify configuration, navigation,
redirects, Markdown links, generated package copies, frontmatter, documented
scripts and the generated website changelog. CI additionally runs
`mint validate --no-build` and `mint broken-links` from `apps/docs/`.

## Working rules

- Read [AGENTS.md](../AGENTS.md) before changing package boundaries or captured
  data.
- Keep public docs and engineering docs separate. Do not duplicate the Mintlify
  site under `docs/`.
- A new captured field is not complete until both redaction layers, the privacy
  docs and the secret-leak tests are updated.
- Do not claim a test, build, benchmark or client compatibility result passed
  without running it and recording the result.
