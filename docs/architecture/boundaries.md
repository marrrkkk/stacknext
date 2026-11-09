---
title: Architecture boundaries
description: The invariants that keep StackNext local, bounded, deterministic and read-only.
---

These rules are not suggestions. They keep the runtime, privacy and evidence
model consistent.

## Local-only network

- The collector binds to `127.0.0.1` or `localhost` and rejects other hosts.
- Ingestion requires the bearer token.
- Read APIs and SSE accept the bearer token or the dashboard session cookie.
- Host, Origin and `Sec-Fetch-Site` checks, CSP and security headers stay intact.
- There is no remote transport, managed container runtime or cloud service.

## Native-only runtime

The collector and dashboard run in a Node process started by the CLI. There is
no `runtime.mode` field and no Docker/native peer flag. See
[ADR 0001](../adr/0001-native-only-runtime).

## Bounded memory and validation

Every ingest envelope is Zod-validated, body size is capped, and counts are
bounded before storage. The store has capacity and retention limits and exposes
drops. Instrumentation never blocks a request on network I/O.

## Two-layer redaction

Redact in the app process before enqueueing and again in the collector before
storing. A new field is not complete until both layers and the privacy docs are
updated. See [redaction](../security/redaction).

## Evidence, not scores

Coverage statuses come from the current sample plus config/connection state.
There is no composite percentage. `not-observed` and `unknown` are not proof of
a broken feature. Diagnostics are deterministic heuristics, never confirmed
root causes. Comparisons are report-only and never claims of significance.

## Regression and snapshot storage

- Local files only, with strict versioned schemas.
- `0700`/`0600` permissions, atomic writes and size caps.
- Never auto-delete runs, baselines or comparisons.
- Never overwrite a record without an explicit overwrite request.
- Keep invalid or incomplete records visible instead of repairing them.
- Snapshots are frozen, redacted copies; never replay them.

## Read-only MCP

All tools are `readOnlyHint: true`. The API client performs GETs only and
refuses non-loopback URLs. stdout is protocol-only. Prompts and the Agent Skill
shape investigations but cannot add capabilities.

## Playwright stays optional and sequential

The fixture is inert outside an active capture run and does not replace
Playwright or change assertions. Captured runs use one worker until parallel
correlation is explicitly verified. Identity comes from an annotation, never a
time window.

## Supported surface only

Next.js 15/16 App Router, Node.js runtime. No Edge or production support, no
undocumented Next.js internals, no `NEXT_PRIVATE_*` switches.
