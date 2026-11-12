# Adoption metrics

StackNext does not collect telemetry, accounts or per-user identifiers, so
adoption is measured only from aggregate, public sources. This page defines the
signals maintainers may review and how to interpret them.

## Principles

- Use aggregate counts only. Never record a user, project, machine, IP address
  or captured telemetry value.
- Do not add analytics, pixels, remote fonts or outbound calls to the dashboard,
  CLI, MCP server or docs to improve measurement.
- Downloads and stars are directional signals, not proof that a feature works.
  Pair them with issues, discussions, compatibility runs and qualitative
  reports.
- Record the date and release context with every snapshot. Do not compare
  numbers from different sources as if they measured the same thing.

## Signals

| Signal | Source | What it can show | Caveat |
| --- | --- | --- | --- |
| npm downloads | `https://api.npmjs.org/downloads/point/last-week/<package>` | Distribution reach for `@stacknext/cli` and `@stacknext/next` | Includes CI, mirrors and automated installs; a single number is not active users |
| GitHub repository | `https://api.github.com/repos/marrrkkk/stacknext` | Stars, forks, watchers and open issue count | Stars are not usage; forks may be stale |
| Releases | GitHub releases and npm versions | Whether people can install the current version | A published package can be installed without being used |
| Issues and discussions | GitHub | Recurring problems, feature demand and support load | Silent users are invisible |
| Documentation analytics | The docs host's aggregate dashboard, if enabled | Which guides are read | Aggregate page views only; no visitor-level detail |
| Compatibility and consumer runs | This repository's CI artifacts | Supported installation combinations | Synthetic, not user adoption |

Do not infer adoption from StackNext runtime data. The collector is local,
in-memory and never reports home.

## Monthly snapshot

Run this from a trusted machine and record the results in a maintainer issue or
a private maintainer note. The npm endpoint is public and needs no token.

```bash
curl -fsS 'https://api.npmjs.org/downloads/point/last-week/@stacknext/cli'
curl -fsS 'https://api.npmjs.org/downloads/point/last-week/@stacknext/next'
curl -fsS 'https://api.github.com/repos/marrrkkk/stacknext'
```

Optional aggregate checks:

```bash
gh issue list --state open --limit 100 --json number,title,labels,createdAt
gh release list --limit 5
```

Record:

| Field | Value |
| --- | --- |
| Date | |
| Latest StackNext release | |
| `@stacknext/cli` weekly downloads | |
| `@stacknext/next` weekly downloads | |
| GitHub stars / forks / watchers | |
| Open issues / open pull requests | |
| Notable issue or discussion themes | |
| Docs analytics, if available | |
| Follow-ups | |

## Interpretation

- Compare the same source over the same window. npm reports daily, weekly and
  monthly points; do not mix them.
- Treat a release bump as a possible distribution event, not proof of value.
  Check whether issues and discussions show people successfully using the new
  surface.
- A rise in issues can mean adoption or a regression. Read the reports before
  drawing a conclusion.
- A flat download count with active discussions may still indicate a healthy
  niche project; do not optimize the roadmap for a vanity metric.
- If a signal would require collecting user data to improve, do not collect it.
  Ask for voluntary, public feedback instead.

## Reporting

Aggregate snapshots may be shared publicly. Never include a reporter's token,
project name, filesystem path, captured request, SQL or environment details.
Security reports follow [SECURITY.md](../../SECURITY.md), not a public issue.
