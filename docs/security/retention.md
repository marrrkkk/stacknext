---
title: Retention
description: In-memory telemetry limits, drop counters and the lifecycle of saved records and snapshots.
---

## Live telemetry

The store is in memory and bounded by:

- `collector.maxSpans` — total span capacity (default 5,000). Error and query
  buffers are derived from it.
- `collector.retentionMs` — how long received telemetry stays (default 600,000
  ms, or 10 minutes).

When data ages out or capacity is reached, it is dropped and the drop counters
increase. A finding can disappear because its evidence left the sample, not
because the problem was fixed. The report always includes its sample window and
counts.

The store is reset when the collector process exits. Use an explicit snapshot
if you need evidence after a restart.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:6b6f0561488e38ef461b5990773e6f66db72d178ad88448bdfcb9d4ff71ea956 -->

## Regression records

Runs, baselines and comparisons are local files under
`.stacknext/{runs,baselines,comparisons}`. They are immutable and never
auto-deleted. Remove a baseline with `stacknext baseline remove <baseline-id> --yes`.
To remove an individual run or comparison, delete its corresponding JSON file in
`.stacknext/runs` or `.stacknext/comparisons`; there are no CLI removal commands
for those records. Never overwrite without an explicit request. Each record is
capped at 16 MiB.

<!-- /coderabbit-ai-generated:v1 -->

## Snapshots

| Source | Created by | Rotation |
| --- | --- | --- |
| `manual` | `stacknext snapshot save` or dashboard | Never automatic |
| `import` | `stacknext snapshot import` | Never automatic |
| `exit` | Graceful `stacknext dev` shutdown | Keep newest `snapshots.autoKeep` |
| `error` | First error, 60-second cooldown | Keep newest `snapshots.autoKeep` |

`snapshots.autoKeep` defaults to 10. `snapshots.maxBytes` defaults to 64 MiB;
an oversized save fails instead of truncating. Snapshots are never replayed
into the live store.

## Dashboard and MCP

Both read the current sample. MCP can also read saved regression and snapshot
records, but cannot create, rotate or delete them. A snapshot read carries no
live diagnostics or coverage.

## Related

- [Configuration](../packages/core/configuration)
- [Snapshot storage](../packages/core/snapshots)
- [Snapshots guide](../guides/snapshots)
