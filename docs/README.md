# StackNext documentation

The documentation website is configured by [docs.json](docs.json) and can be
previewed from the repository root with `pnpm docs:dev`. Start with the
[documentation home](index.md) or the repository [README](../README.md).

## Using StackNext

| Document | What it covers |
| --- | --- |
| [What is StackNext?](overview/what-is-stacknext.md) | Capabilities, local-first design and intentional boundaries. |
| [Requirements](getting-started/requirements.md) | Supported Node.js, Next.js, runtime and ports. |
| [Installation](installation.md) | Install, initialize, verify, upgrade and monorepo setup. |
| [Quickstart](getting-started/quickstart.md) | First collector session and dashboard checks. |
| [Configuration](getting-started/configuration.md) | `stacknext.config.json`, environment variables and defaults. |
| [Uninstall and cleanup](uninstall.md) | Safe removal of generated files, data and packages. |
| [Compatibility](compatibility.md) | Tested Node.js/Next.js/package-manager combinations. |
| [Troubleshooting](troubleshooting.md) | Missing telemetry, ports, MCP, regression and Windows/WSL issues. |
| [Limitations](limitations.md) | Unsupported runtimes, heuristics and known gaps. |

## Guides

| Document | What it covers |
| --- | --- |
| [Next.js integration](guides/nextjs.md) | Registration, supported versions and existing OTel setups. |
| [Runtime evidence](guides/runtime-evidence.md) | Traces, errors and performance investigation. |
| [Database integrations](guides/database.md) | Drizzle and Prisma adapter choice and limits. |
| [Diagnostics](guides/diagnostics.md) | Six deterministic rules, statuses and evidence. |
| [Runtime regression](guides/regression.md) | Capture, baseline, compare and verified correlation. |
| [Snapshots](guides/snapshots.md) | Frozen redacted samples and their lifecycle. |
| [Instrumentation coverage](instrumentation-coverage.md) | Evidence-based coverage statuses and their limits. |
| [Custom instrumentation](custom-instrumentation.md) | Manual spans and attribute sanitization. |
| [Server Actions](server-actions.md) | `withStackNextAction` and action evidence. |
| [Regression testing](regression-testing.md) | Full capture-to-comparison workflow. |
| [Playwright integration](playwright-integration.md) | Fixture setup, annotations and trace probing. |
| [Baselines](baselines.md) | Baseline format, storage and lifecycle. |
| [Comparison methodology](comparison-methodology.md) | Medians, thresholds, severity and inconclusive rules. |
| [CI integration](ci-integration.md) | GitHub Actions example, artifacts and environment matching. |

## Packages

The [package documentation index](packages/index.md) lists public integration
packages and internal implementation packages. Every package ships its own
`docs/` directory in the npm archive; the pages under `docs/packages/` are
generated copies of those canonical files.

## Agents and MCP

| Document | What it covers |
| --- | --- |
| [AI agent support](ai-agents/index.md) | Package docs, managed instructions, skill and MCP. |
| [Local documentation](ai-agents/local-docs.md) | Version-matched docs inside installed packages. |
| [AGENTS.md integration](ai-agents/agents-md.md) | Safe managed block behavior. |
| [Agent Skill](ai-agents/skill.md) | Portable evidence-first workflows. |
| [Supported agents](ai-agents/supported-agents.md) | OpenCode, Codex, Claude Code and other MCP clients. |
| [Agent workflows](ai-agents/workflows.md) | The evidence-first investigation loop. |
| [MCP server](mcp.md) | Twenty read-only tools, five prompts and response metadata. |
| [Project instruction files](integrations/agent-instructions.md) | Managed `AGENTS.md` and manual client files. |
| [OpenCode](integrations/opencode.md) | Client setup. |
| [Codex](integrations/codex.md) | Client setup. |
| [Claude Code](integrations/claude-code.md) | Client setup. |

## Design and project

| Document | What it covers |
| --- | --- |
| [Architecture](architecture.md) | Package boundaries, collector, store and diagnostic engine. |
| [Package architecture](architecture/packages.md) | Responsibilities and dependency direction. |
| [Architecture boundaries](architecture/boundaries.md) | Local, bounded, deterministic and read-only invariants. |
| [Privacy and redaction](privacy.md) | Data captured, redaction layers and network boundary. |
| [Data collection](security/data-collection.md) | What is collected and what is never collected. |
| [Redaction](security/redaction.md) | Two redaction layers and their limits. |
| [Retention](security/retention.md) | In-memory and saved-record lifecycle. |
| [Benchmark](benchmark.md) | Ingest, diagnostics and verbose-tracing measurements. |
| [Dashboard layout specification](ux-layout-prompt.md) | Shell, navigation, page headers and interaction criteria. |
| [Contributing](contributing/index.md) | Repository setup, gates and documentation conventions. |
| [Development environment](contributing/environment.md) | Install, build, example app and docs preview. |
| [Testing](contributing/testing.md) | Unit, e2e, archive and documentation checks. |
| [Documentation conventions](contributing/documentation.md) | Canonical docs, generation and validation. |
| [Releasing](releasing.md) | Versioning, package validation and publishing. |
| [Agent testing](agent-testing.md) | Protocol and client compatibility record. |
| [ADR 0001: native-only runtime](adr/0001-native-only-runtime.md) | Why StackNext does not ship a managed container runtime. |

Repository-level documents: [Contributing](../CONTRIBUTING.md),
[brand assets](../brand/README.md), [changelog](https://github.com/marrrkkk/stacknext/blob/main/CHANGELOG.md),
[security policy](https://github.com/marrrkkk/stacknext/blob/main/SECURITY.md), [support](https://github.com/marrrkkk/stacknext/blob/main/SUPPORT.md),
[code of conduct](../CODE_OF_CONDUCT.md) and
[repository conventions](../AGENTS.md).
