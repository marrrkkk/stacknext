---
title: Security
description: Loopback-only access, token handling, redaction and read-only guarantees for the MCP server.
---

# Security

## Network boundary

- `StackNextApiClient` refuses collector URLs that are not loopback.
- The server does not listen on a port; it uses stdio.
- Do not wrap it in a remote transport or proxy.
- The collector must already be running; the MCP server does not start one.

## Token handling

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:579ffb8581d348098dc3a06b9b44440ae3f15737830d35ac0b88eb27de39cb0b -->

The bearer token is read from `.stacknext/run.json` or supplied with `--token`.
The server never returns it to tool callers or writes it to stdout; stdout is
protocol-only. A literal `--token` value may be recorded in shell history and
exposed to anyone who can read that history. Prefer the runtime state in
`.stacknext/run.json` when available.

<!-- /coderabbit-ai-generated:v1 -->

## Read-only tools

Every tool is annotated read-only and the client only performs GET requests.
The server cannot:

- ingest or delete telemetry;
- capture a run, save a baseline or create a comparison;
- save, import, rotate or delete a snapshot;
- edit source files or configuration;
- run SQL, EXPLAIN or shell commands;
- read arbitrary files.

Regression and snapshot tools can read records in the collector's configured
project directory only.

## Data returned

Tool results contain the same redacted data as the dashboard: routes, error
text, SQL fragments, span attribute values, timings, scenario file paths and
environment facts. Treat the client conversation and logs as part of the local
debugging environment.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:ac6bff8a06dc93a3985cd0995d7a10b4f0b68e0fec4e876e2a646c63875ca582 -->

Request/response bodies, headers, cookies, SQL bind parameters and Playwright
artifacts are not captured directly, and the collector token is not returned.
Structured URLs exclude query values. Sensitive values embedded in free-form
text, such as errors returned by `get_error`, may remain when URL redaction
stops at punctuation. Review results for sensitive information before sharing
them.

<!-- /coderabbit-ai-generated:v1 -->

## Prompts and the Agent Skill

Prompts and the `stacknext-debugging` skill shape an investigation but cannot
add capabilities. They must not instruct an agent to bypass redaction, read
`.stacknext/run.json` or send data to a remote service.

## Reporting

Security issues follow the repository `SECURITY.md`, not public issues.
