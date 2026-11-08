# Baselines

A baseline is an immutable snapshot of a completed capture run. It records the
scenario identities, verified samples, redacted telemetry, environment facts and
statistics that a later candidate run is compared against. A baseline is not a
live view of the collector and it does not follow changes to the app.

StackNext stores baselines under `<project>/.stacknext/baselines/`. They are
local JSON files, are never uploaded and are never deleted automatically.

## What a baseline contains

| Field | Meaning |
| --- | --- |
| `id` | Stable `base-<16 hex>` id used by `compare` and the MCP tools. |
| `name` | Human-readable label supplied at save time. |
| `projectName` | StackNext project name from the capture run. |
| `sourceRunId` | The `run-<16 hex>` capture run the baseline was copied from. |
| `createdAt` | Save time, not the time of the original run. |
| `environment` | Node.js, Next.js, OS, architecture, database adapters, instrumentation flags, SDK and Playwright versions, and the diagnostics rule-set version. |
| `scenarios` | Canonical scenario identity plus verified samples, bounded traces, spans, queries, errors and findings. |
| `stats` | Scenario, sample, trace, span, error and query counts. |
| `notes` and `warnings` | Human context and caveats. |
| `limitations` | The standard comparison limitations. |

The record is versioned and validated with a strict Zod schema. Unknown fields,
wrong formats and oversized records are rejected on read. The current format is
`stacknext-baseline`, version `1`.

A baseline copies evidence from the run file. It does not reference the live
in-memory store, so restarting the app or waiting for retention to prune
telemetry does not change an existing baseline.

## Before saving

A useful baseline is stable and representative:

1. **Build and warm the app.** Request each scenario route once before capturing.
   A cold route can emit one-time framework spans such as `load route module`;
   if those spans appear only on one side of a comparison, the result may be
   inconclusive.
2. **Use the same environment** you will use for candidates: Node.js, Next.js,
   OS, database setup, instrumentation flags and verbose-tracing setting.
3. **Use explicit scenario annotations.** The annotation is the stable identity.
   Renaming a test title or moving the file does not create a new scenario when
   the annotation is unchanged.
4. **Capture more than the minimum.** The default comparison requires three
   verified samples per scenario. `--repeat-each=3` is the practical minimum;
   more samples reduce noise but take longer.
5. **Use one Playwright worker.** Captured correlation is verified with
   `--workers=1`. Do not use parallel workers for a baseline or candidate.
6. **Check the run before saving.** `stacknext runs show <run-id>` should report
   `completed`, at least one verified sample per relevant scenario and no
   incomplete samples.

## Create a baseline

From the app directory, with `stacknext dev` running:

```bash
pnpm exec stacknext capture \
  --name "example baseline" \
  --quiet --json \
  -- pnpm exec playwright test --workers=1 --repeat-each=3 \
  > baseline-capture.json

RUN_ID=$(jq -r .run.id baseline-capture.json)

pnpm exec stacknext baseline save "$RUN_ID" \
  --name "example baseline" \
  --notes "before checkout changes" \
  --json > baseline.json

BASELINE_ID=$(jq -r .baseline.id baseline.json)
```

Saving performs these checks:

- the run id must match `run-[0-9a-f]{16}`;
- the run must exist under `.stacknext/runs/`;
- the run status must be `completed`;
- the run must contain at least one verified sample.

A `failed`, `interrupted` or `incomplete` run is refused. A completed run with
several scenarios is accepted even if one scenario has few samples; the
comparison will mark that scenario inconclusive if it does not meet the
minimum.

Each save creates a new `base-` id, so saving the same run twice produces two
independent baseline records. A normal save never replaces an existing record.
At the storage layer, an overwrite requires an explicit overwrite request; it is
never inferred from a matching name or source run. Deleting a baseline is a
separate, explicit `baseline remove --yes` operation.

## Inspect baselines

```bash
pnpm exec stacknext baseline list
pnpm exec stacknext baseline list --limit 20 --offset 0 --json
pnpm exec stacknext baseline show "$BASELINE_ID"
pnpm exec stacknext baseline show "$BASELINE_ID" --json
```

The list is sorted by creation time, newest first. It reports the source run,
scenario and sample counts, and the recorded environment. The detail view
includes the captured scenarios and their sample evidence.

The dashboard exposes the same records at `/baselines` and
`/baselines/:id`. The MCP server exposes them read-only through
`stacknext_list_baselines` and `stacknext_get_baseline`.

## Use a baseline

Compare it with a later capture run:

```bash
pnpm exec stacknext compare "$BASELINE_ID" "$CANDIDATE_ID" --json
```

The candidate does not have to be saved as a baseline and may be `failed`,
`incomplete` or `interrupted`; it is still stored, but the comparison will be
inconclusive because the candidate run did not complete. A candidate must have
its own `run-` id.

See [comparison methodology](comparison-methodology.md) for the matching and
threshold rules, and [regression testing](regression-testing.md) for the full
capture workflow.

## Lifecycle and retention

```
stacknext dev / capture
        │
        ▼
  .stacknext/runs/run-*.json       (capture record)
        │  baseline save
        ▼
  .stacknext/baselines/base-*.json (immutable snapshot)
        │  compare
        ▼
  .stacknext/comparisons/cmp-*.json
```

- **Baselines are not pruned.** There is no retention timer and no automatic
  cleanup. A baseline stays until it is explicitly removed.
- **Comparisons are not pruned either.** They are separate records; removing a
  baseline does not remove comparisons that reference it.
- **A removed baseline cannot be compared again.** The comparison record remains
  readable as history, but `compare` needs the baseline file.
- **No baseline is created implicitly.** A capture run is not a baseline until
  `baseline save` succeeds.
- **Stored files are private.** The `.stacknext` directory is created with mode
  `0700`, records use `0600`, and `.stacknext/.gitignore` contains `*` so
  runtime state is not committed by accident.

## Remove a baseline

```bash
pnpm exec stacknext baseline remove "$BASELINE_ID" --yes
```

`--yes` is mandatory. The command refuses without it, and removing a baseline
is permanent. There is no undo and no automatic backup. If the baseline is
still needed as a reference, copy the JSON file to a location outside
`.stacknext` before removing it.

## Sharing and portability

A baseline is portable only when the environment matches the candidate. The
environment comparison checks (including the diagnostics rule-set version):

- Node.js version;
- Next.js version;
- platform and architecture;
- runtime (`nodejs`);
- enabled database adapters;
- verbose tracing, fetch capture and error capture flags;
- SDK version;
- Playwright version;
- project name.

Any difference makes the comparison inconclusive by default. This is deliberate:
a baseline from a different Node.js version or verbose-tracing mode is not a
valid performance reference. `--ignore-environment` can compute a result anyway,
but it reports a warning and does not make the environments equivalent.

For CI, store the baseline as a controlled artifact or copy it into the
workspace at a known step. Do not rely on a developer's local `.stacknext`
directory being present on the runner. See [CI integration](ci-integration.md).

## Baseline hygiene

- Capture a new baseline when the app's expected behavior intentionally changes.
- Keep the baseline name descriptive: branch, date, commit or feature area.
- Save the capture run and comparison JSON alongside the baseline when
  investigating a disputed result.
- Re-capture the baseline after upgrading Node.js, Next.js, Playwright,
  database drivers or instrumentation flags.
- Do not edit a baseline file by hand. Strict schema validation will reject
  malformed records, and hand-edited evidence is no longer trustworthy.
- Review baselines and comparisons before sharing them. They contain redacted
  route, span, query, error and environment data, but they are still local
  debugging artifacts.

## Related documentation

- [Runtime regression testing](regression-testing.md)
- [Playwright integration](playwright-integration.md)
- [Comparison methodology](comparison-methodology.md)
- [CI integration](ci-integration.md)
- [Privacy and redaction](privacy.md)
- [MCP server](mcp.md)
