---
title: Agent Skill
description: The bundled stacknext-debugging skill, supported clients and installation behavior.
---

# Agent Skill

`@stacknext/cli` ships the portable Agent Skill at:

```text
node_modules/@stacknext/cli/skills/stacknext-debugging/
├── SKILL.md
└── references/
    ├── documentation.md
    ├── setup.md
    ├── tools.md
    └── workflows.md
```

The repository's `skills/stacknext-debugging/` directory is the canonical
source. It is copied into the CLI archive before packing.

## What it covers

- local documentation discovery and version checks;
- the twenty read-only MCP tools;
- evidence-first workflows for errors, slow requests, database activity,
  diagnostic findings, regression records and snapshots;
- mandatory reasoning rules: observation versus causation, null durations,
  overlapping spans, coverage gaps, `inconclusive` comparisons and the
  difference between a snapshot and live telemetry.

The skill does not duplicate full package API references. It points to the
installed package docs for those.

## Commands

```bash
stacknext skill path
stacknext skill path --json
stacknext skill install --client opencode
stacknext skill install --client codex
stacknext skill install --client claude-code
stacknext skill install --client codex --dir ./apps/my-app
stacknext skill install --client codex --force
```

## Behavior

- `skill path` prints the bundled directory, or `{ path, version }` with
  `--json`.
- `skill install` copies the whole directory into the client's project path.
- An existing destination is not replaced without `--force`; the command exits
  `1` and reports the path.
- `--dir` selects the project root; it defaults to the current directory.
- Unsupported clients throw with the three supported names.

## Version alignment

`SKILL.md` frontmatter contains `metadata.version`, which must equal the
StackNext package version. The release workflow and package archive validation
enforce this. The repository skill is updated by the release preparation script
along with package versions.

## Portable format

`SKILL.md` follows the Agent Skills specification with YAML frontmatter and a
concise body. Details live in `references/`. Keep it portable: no
client-specific syntax in the canonical skill and no claim of support without a
recorded test in `docs/agent-testing.md`.

## Client paths

See [Agent setup](agent-setup.md) for the project paths and the recommended
installation order.
