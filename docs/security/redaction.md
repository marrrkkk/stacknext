---
title: Redaction
description: How two redaction layers protect runtime data before it is stored, exported or read by an agent.
---

StackNext redacts twice:

1. **In the app process**, before an envelope is enqueued for transport.
2. **In the collector**, before the envelope enters the store.

A field that bypasses either layer is a bug. Captured records are re-sanitized
when written and snapshots are re-normalized and re-redacted on import.

## Rules

| Data | Treatment |
| --- | --- |
| URLs | Keep the path only; drop query values and fragments |
| Sensitive keys | Replace values with `[redacted]` |
| Error messages and stacks | Text-redacted for tokens, secrets and absolute user paths |
| SQL | Keep the normalized shape; remove literal values and bind parameters |
| Resource attributes | Allowlist only |
| Headers, bodies, cookies | Never captured; privacy flags must remain `false` |
| Span attributes | Sanitized with the same rules before export |

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
