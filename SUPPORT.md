# Support

StackNext is an MIT-licensed community project. Support is best effort; there
is no commercial SLA.

## Read these first

- [Installation](apps/docs/installation.mdx)
- [Quickstart](apps/docs/getting-started/quickstart.mdx)
- [Compatibility](apps/docs/compatibility.mdx)
- [Troubleshooting](apps/docs/troubleshooting.mdx)
- [Privacy and redaction](apps/docs/privacy.mdx)
- [Limitations](apps/docs/limitations.mdx)
- [Documentation index](apps/docs/index.mdx)

Run `npx stacknext doctor --json` before asking for help. It checks the runtime
state, collector, instrumentation, config and versions.

## Questions and ideas

Use [GitHub Discussions](https://github.com/marrrkkk/stacknext/discussions) for
usage questions, workflow ideas and show-and-tell. If Discussions is not enabled
yet, open a feature request with the `question` label instead.

## Bugs

Open an issue with the bug report form. Include:

- StackNext, Node.js and Next.js versions;
- package manager and operating system;
- whether the app uses TypeScript or JavaScript;
- the output of `npx stacknext doctor --json`;
- minimal reproduction steps;
- expected and actual behavior;
- relevant redacted logs or CLI output.

Do not include tokens, `.stacknext/run.json`, customer data, request bodies,
headers, cookies, SQL bind parameters or full captured records. Redact paths and
URLs before posting.

## Feature requests

Open an issue with the feature request form. Explain the problem, the evidence
you need, and why the existing dashboard/CLI/MCP/regression surfaces are not
enough. StackNext stays local-first and read-only where documented; proposals
that add a cloud service, outbound telemetry, automatic source edits or LLM
calls are out of scope.

## Security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md) and use GitHub's
private vulnerability reporting.

## Supported versions

Security fixes target the latest 0.10.x release. Older versions and unpublished
source snapshots are not supported. See the [compatibility matrix](apps/docs/compatibility.mdx)
for runtime support.

## What maintainers cannot help with

- Debugging an application's own code without a minimal reproduction.
- Recovering redacted data or bypassing the privacy boundary.
- Hosted, multi-user or Edge deployment design.
- Third-party coding-agent configuration beyond the documented integrations.
- Guaranteeing a regression comparison is statistically significant or causal.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Release work is maintainer-only; see
[docs/deployment/release-process.md](docs/deployment/release-process.md).
