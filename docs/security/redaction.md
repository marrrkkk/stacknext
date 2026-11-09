---
title: Redaction
description: How two redaction layers protect runtime data before it is stored, exported or read by an agent.
---

StackNext redacts twice:

1. **In the app process**, before an envelope is enqueued for transport.
2. **In the collector**, before the envelope enters the store.

A field that bypasses either layer is a bug. Captured records are re-sanitized
when written and snapshots are re-normalized and re-redacted on import.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:c7ab46ceaafff2f930507173fdb27865ff8a1018ad7a2a38ebe476f79a8dad0d -->

## Rules

| Data | Treatment |
| --- | --- |
| URLs | Drop query values and fragments; absolute URLs may retain scheme, hostname and path. Check hostnames before sharing exports |
| Sensitive keys | Replace values with `[redacted]` |
| Error messages and stacks | Known token and secret patterns are redacted; absolute user paths may remain. Inspect paths before sharing exports or snapshots |
| SQL | Pattern-based redaction; inline literals may remain. Bind parameters are not captured. Review exports before sharing |
| Resource attributes | Allowlist only |
| Headers, bodies, cookies | Never captured; privacy flags must remain `false` |
| Span attributes | Sanitized with the same rules before export |

<!-- /coderabbit-ai-generated:v1 -->

## Sensitive keys

Key matching is case-insensitive and covers common authorization, cookie,
password, secret, token and API-key names. Redaction is applied recursively to
objects and bounded arrays. Unknown structures are not passed through
unchecked.

## What redaction cannot do

- It cannot recover a value that was correctly removed.
- It cannot guarantee that a secret placed inside an error message is
  recognized if it does not match a rule. Do not put secrets in logs or error
  text.
- It does not make a hosted client's retention policy private.

## Verify

```bash
pnpm exec stacknext export --stdout
```

Search the output for the values you expect to be absent. The repository's
tests assert that known example secrets do not appear in API, export,
regression or snapshot output.

## Related

- [Privacy and redaction](../privacy)
- [Core redaction reference](../packages/core/redaction)
- [Data collection](data-collection)
