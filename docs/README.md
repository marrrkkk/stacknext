# StackNext documentation

Start with the [README](../README.md) for the package quick start and the
[installation guide](installation.md) for a real app.

## Using StackNext

| Document | What it covers |
| --- | --- |
| [Installation](installation.md) | Install, initialize, verify, upgrade and monorepo setup. |
| [Uninstall and cleanup](uninstall.md) | Safe removal of generated files, data and packages. |
| [Getting started](getting-started.md) | Configuration, dashboard routes, adapters and commands. |
| [Compatibility](compatibility.md) | Tested Node.js/Next.js/package-manager combinations. |
| [Troubleshooting](troubleshooting.md) | Missing telemetry, ports, MCP, regression and Windows/WSL issues. |
| [Privacy and redaction](privacy.md) | Data captured, redaction layers and network boundary. |
| [Limitations](limitations.md) | Unsupported runtimes, heuristics and known gaps. |
| [Benchmark](benchmark.md) | Ingest, diagnostics and verbose-tracing measurements. |

## Design

| Document | What it covers |
| --- | --- |
| [Dashboard UX layout prompt](ux-layout-prompt.md) | Shell, navigation, page headers, command menu and acceptance criteria. |

## Observability

| Document | What it covers |
| --- | --- |
| [Instrumentation coverage](instrumentation-coverage.md) | Evidence-based coverage statuses and their limits. |
| [Custom instrumentation](custom-instrumentation.md) | Manual spans and attribute sanitization. |
| [Server Actions](server-actions.md) | `withStackNextAction` and action evidence. |
| [Architecture](architecture.md) | Package boundaries, collector, store and diagnostic engine. |

## Runtime regression testing

| Document | What it covers |
| --- | --- |
| [Regression testing](regression-testing.md) | Capture, save a baseline, compare and reason about statuses. |
| [Playwright integration](playwright-integration.md) | Fixture setup, annotations, correlation and trace probing. |
| [Baselines](baselines.md) | Baseline format, storage and lifecycle. |
| [Comparison methodology](comparison-methodology.md) | Medians, thresholds, severity and inconclusive rules. |
| [CI integration](ci-integration.md) | GitHub Actions example, artifacts and environment matching. |

## Agents and MCP

| Document | What it covers |
| --- | --- |
| [MCP server](mcp.md) | Seventeen read-only tools, five prompts and response metadata. |
| [Agent skill](../skills/stacknext-debugging/SKILL.md) | Portable evidence-first debugging workflows, bundled in `@stacknext/cli`. |
| [Agent instructions](integrations/agent-instructions.md) | Safe instruction snippets for project files. |
| [Agent testing](agent-testing.md) | Protocol and client compatibility record. |
| [OpenCode](integrations/opencode.md) | Client setup. |
| [Codex](integrations/codex.md) | Client setup. |
| [Claude Code](integrations/claude-code.md) | Client setup. |

## Project and release

| Document | What it covers |
| --- | --- |
| [Contributing](../CONTRIBUTING.md) | Development setup, gates and review expectations. |
| [Brand assets](../brand/README.md) | Open Span mark, lockups, app icons, favicon and usage rules. |
| [ADR 0001: native-only runtime](adr/0001-native-only-runtime.md) | Why StackNext does not ship a managed container runtime. |
| [Releasing](releasing.md) | Versioning, package validation, trusted publishing and rollback. |
| [Changelog](../CHANGELOG.md) | Release history and breaking changes. |
| [Security policy](../SECURITY.md) | Private vulnerability reporting and threat model. |
| [Support](../SUPPORT.md) | Where to ask for help and what to include. |
| [Code of conduct](../CODE_OF_CONDUCT.md) | Community expectations. |
| [Repository conventions](../AGENTS.md) | Architecture invariants and verification workflow. |
