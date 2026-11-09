---
title: Redaction
description: The redaction and sanitization functions that run in the app process and again in the collector.
---

# Redaction

Redaction is a core invariant, not an optional feature. StackNext applies it
twice:

1. **In the application process**, before an event is enqueued.
2. **In the collector**, before an event enters the in-memory store.

A bug in one layer does not automatically expose raw data through the other.

## Exported helpers

The exact exports are listed in `packages/core/src/index.ts`; the functions most
commonly used by adapters and instrumentation are:

| Function | Purpose |
| --- | --- |
| `redactText(value, maxLength?)` | Replaces recognized secret patterns and bounds the length. |
| `redactErrorText(value)` | Text redaction for messages and stacks. |
| `redactSql(sql)` | Removes credential-shaped values from SQL text. |
| `sanitizeAttributes(attributes)` | Redacts sensitive keys, header-shaped maps and URL query values. |
| `sanitizeResource(attributes)` | Keeps only the resource allowlist. |
| `stripUrlQuery(value)` | Removes query strings and fragments from a URL or path. |
| `stripUrlQueryInText(value)` | Removes embedded URLs' query strings from free text. |
| `normalizeSpan(...)` / normalization helpers | Convert and bound stored telemetry. |

Check the current TypeScript declarations in the installed package before
calling a helper that is not listed here; this page deliberately does not invent
exports.

## What is redacted

- **URLs** lose query values and fragments. `http://host/path?token=secret`
  becomes `http://host/path`.
- **Sensitive keys** containing authorization, cookie, password, secret, API
  key, access/refresh/private token, client secret, credential, connection
  string, database URL, DSN and similar terms become `[redacted]`.
- **Header-shaped attribute maps** are replaced wholesale.
- **Secret patterns** such as bearer tokens, JWTs, GitHub/Slack/Stripe-like
  keys, AWS access key ids, credential-bearing connection strings and
  `key=value` password/token patterns are replaced.
- **SQL text** is redacted, and bind parameters are never read.
- **Error messages and stacks** pass through the same text redaction. Stack URLs
  lose query strings.
- **Resource attributes** are reduced to an allowlist: service name, version,
  namespace, SDK metadata, runtime, Next.js version and environment.

## What is never captured

StackNext has no field for request or response bodies, headers, cookies, URL
query values, SQL bind parameters, Playwright artifacts, machine identifiers or
the collector token in telemetry records.

The configuration schema rejects attempts to enable header, body or SQL
parameter capture. See [configuration](configuration.md).

## Limits

Redaction is pattern-based and intentionally conservative, not a formal secret
scanner. An unrecognized literal in a SQL string, URL path segment, span
attribute or error message may still be stored. Keep credentials out of those
places, and review exports, snapshots and regression records before sharing
them.

Custom span and action attributes pass through `sanitizeAttributes` before they
are enqueued and through the collector pass before storage. The helper-added
markers `stacknext.manual` and `stacknext.span.kind` are not sensitive and are
set after caller attributes.

## Adding a field

A new captured field is not complete until:

1. the app-side producer redacts it;
2. the collector validates and redacts it again;
3. `docs/privacy.md` and the package docs describe it;
4. a test asserts that known secrets do not appear in API, export, regression
   or snapshot output.
