---
title: "ADR 0001: native-only runtime"
description: Why StackNext runs as a native Node.js process instead of a managed container.
---

# ADR 0001: Native-only runtime

- Status: Accepted
- Date: 2026-11-03
- Owners: StackNext maintainers

## Context

StackNext is a local-first debugging center for Next.js App Router
applications. The collector, bounded in-memory store and static dashboard run as
a single Node.js process started by `stacknext dev`. The Next.js app, Playwright
captures, the stdio MCP server and regression records stay on the same host.

An optional Docker runtime for the collector and dashboard was implemented and
reviewed in [PR #1](https://github.com/marrrkkk/stacknext/pull/1). It passed CI,
including image build and integration tests, but it added a second lifecycle,
a second cleanup path, Docker-specific CI and release jobs, a `runtime.mode`
configuration field, `--docker`/`--native` flags and a `stop` command.

The question was whether Docker should become the primary or an equal
installation path, including for self-hosting.

## Decision

StackNext has one supported runtime: native Node.js, started by the CLI on the
developer's machine. The project does not ship a managed container runtime as a
peer mode.

The collector remains loopback-only, single-user and in-memory. The CLI, the
Next.js instrumentation, Playwright, the MCP server and regression writes remain
host processes. Packaging changes must not weaken those boundaries.

## Why native-only

1. **There is nothing to orchestrate.** The product is one HTTP server with a
   static dashboard and an in-memory store. It has no Postgres, ClickHouse,
   Redis, queue, worker or object storage.
2. **The audience already has Node.** StackNext instruments a Next.js app, which
   cannot run without Node.js. `npx stacknext dev` adds no runtime prerequisite;
   Docker adds a daemon, a VM on macOS/Windows and an image pull.
3. **Docker does not containerize the workflow.** The app, Playwright, the MCP
   server and `.stacknext` regression writes still run on the host. A container
   replaces the two least demanding processes, not the development loop.
4. **The local threat model is loopback-only.** The dashboard bootstraps an
   unauthenticated session on `/`, the collector allowlists loopback Host and
   Origin headers and the CLI/MCP clients refuse non-loopback URLs. Remote
   self-hosting needs a different auth, TLS, persistence and multi-user model;
   that is a separate product, not a packaging flag.
5. **A second runtime has a real maintenance cost.** Two lifecycles, two test
   matrices, two documentation surfaces and Docker Desktop licensing and
   path-sharing support, without adding diagnostic capability.
6. **Comparable tools follow the same split.** Single-process local tools are
   native-first (otel-desktop-viewer, otel-tui, Drizzle Studio, Prisma Studio,
   Tapflow's local agents). Docker-first tools are multi-service stacks
   (Supabase's backend, SigNoz, Sentry self-hosted, Langfuse) or team/server
   products. Supabase's own CLI is native, and its experimental native runtime
   exists to avoid Docker where no container engine is available.

## Consequences

- One install path, one lifecycle and one verification matrix.
- No `runtime.mode`, `--docker`, `--native`, `stop` command, Docker-specific
  release jobs or supported collector image.
- The archived implementation remains available at tag
  `archive/docker-runtime` for reference. It is not a supported release.
- A future demo container may be published as an explicitly unsupported
  artifact, but it must not become a peer runtime or add a Docker lifecycle to
  the CLI.
- Contributor environments may use containers as a convenience, but native Node
  remains the canonical development and test path.

## Revisit triggers

Revisit this decision if one of these becomes true:

- StackNext needs external services that are painful to install natively.
- It becomes a shared team or remote collector rather than a loopback tool.
- It gains persistence, accounts, RBAC or shared regression records.
- It must run outside a Node project or serve non-JavaScript clients.
- Host isolation from untrusted code becomes a requirement.
- CI and devcontainer parity requires the app itself to run in a container.

A future container or gateway effort should be a separate product with its own
security model, not a second mode on the local tool.

## References

- [PR #1: optional Docker runtime](https://github.com/marrrkkk/stacknext/pull/1)
  (closed, preserved at tag `archive/docker-runtime`)
- [Architecture](../architecture.md)
- [Compatibility](../compatibility.md)
- [Privacy](../privacy.md)
- [Uninstall and cleanup](../uninstall.md)
