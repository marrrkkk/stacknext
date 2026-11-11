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

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:db60a7dcdc0f7b028f4b8bb8b881845bc8d1616febbc9a3cce86a9dc48b6bfed -->

| Function | Purpose |
| --- | --- |
| `redactText(value, maxLength?)` | Replaces recognized secret patterns and bounds the length. |
| `redactErrorText(value)` | Text redaction for messages and stacks. |
| `redactSql(sql)` | Removes credential-shaped values from SQL text. |
| `sanitizeAttributes(attributes)` | Redacts sensitive keys, header-shaped maps and query values in recognized URL attributes. |
| `sanitizeResource(attributes)` | Keeps only the resource allowlist. |
| `stripUrlQuery(value)` | Removes query strings and fragments from a URL or path. |
| `stripUrlQueryInText(value)` | Removes embedded URLs' query strings from free text. |
| `normalizeSpan(...)` / normalization helpers | Convert and bound stored telemetry. |

<!-- /coderabbit-ai-generated:v1 -->

Check the current TypeScript declarations in the installed package before
calling a helper that is not listed here; this page deliberately does not invent
exports.

## What is redacted

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:c0de03cf3ce70089f21a3f2d704c9698d940710f517613abe5dcaae2e71cb0ce -->

- **Recognized URL attributes and fields** lose query values and fragments.
  For example, `http.url: "http://host/path?item=123"` becomes
  `http.url: "http://host/path"`. Custom attributes with unrecognized keys
  can retain URL query values, subject to text-pattern redaction.
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

<!-- /coderabbit-ai-generated:v1 -->

## What is never captured

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:f481c88cbb487056b04357bf8bb24ce14da784fa467267760b99bfac22773387 -->

StackNext has no dedicated field for request or response bodies, headers,
cookies, URL query values, SQL bind parameters, Playwright artifacts, machine
identifiers or the collector token in telemetry records. Custom attributes
with unrecognized keys can still retain URL query values.

<!-- /coderabbit-ai-generated:v1 -->

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
3. `apps/docs/privacy.mdx` and the package docs describe it;
4. a test asserts that known secrets do not appear in API, export, regression
   or snapshot output.
