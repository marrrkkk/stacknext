# Security policy

StackNext is a local development tool. It binds its collector to loopback,
requires a bearer token for ingestion and read APIs, and stores runtime
credentials in `.stacknext/run.json` with mode `0600`. It is not designed for
public, shared or multi-user deployment.

## Supported versions

| Version | Security support |
| --- | --- |
| 0.6.x | Supported |
| Earlier versions | Not supported |

Security fixes are released as patch or minor versions, depending on the
compatibility impact. The project is pre-1.0, so a fix may require a minor.
Deprecated versions are documented in the [changelog](CHANGELOG.md).

## Reporting a vulnerability

Do **not** open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/marrrkkk/stacknext/security/advisories/new>

Include, when possible:

- the affected package and version;
- Node.js, Next.js, OS and package manager versions;
- a minimal reproduction or proof of concept;
- the security impact and the boundary you believe is crossed;
- whether the issue also affects a published archive;
- any suggested fix or mitigation.

Do not include real tokens, customer data, captured records or third-party
secrets. Use synthetic values. If a token was exposed, rotate it and say that it
was rotated; do not send the token itself.

## What to expect

- Maintainers aim to acknowledge a report within five business days.
- We will confirm the affected versions, work on a fix and coordinate disclosure.
- We may ask for clarification or a narrower reproduction.
- We will credit reporters who want credit after a fix is available.
- There is no bug bounty program.

Please give us a reasonable opportunity to fix the issue before public
disclosure. We will not pursue legal action against researchers who follow this
policy, test against their own local installation, avoid privacy violations and
do not access data they do not own.

## Security scope

In scope:

- collector authentication, session cookies, Host/Origin/`Sec-Fetch-Site` checks,
  CSP and security headers;
- the loopback-only network boundary and rejection of non-loopback URLs;
- ingest validation, body-size limits, bounded queues and denial-of-service
  resistance;
- redaction bypasses that expose request bodies, headers, cookies, URL query
  values, SQL bind parameters, tokens or Playwright artifacts;
- dashboard, CLI, MCP and export paths that leak captured data;
- package archive integrity, executable permissions, unresolved workspace
  ranges or accidental inclusion of secrets/source/test files;
- read-only MCP guarantees and prompt/instruction injection that could make a
  tool mutate data;
- local file permissions for `.stacknext` runtime state and saved records.

Out of scope:

- hosted, multi-user or Edge deployments (unsupported);
- vulnerabilities in Next.js, OpenTelemetry, Drizzle, Prisma, Playwright or
  other dependencies that are not exploitable through StackNext;
- an attacker who already has the local user's filesystem access or can read
  `.stacknext/run.json`;
- social engineering, spam or physical attacks;
- reports that require disabling documented privacy settings or running the
  collector on a non-loopback interface;
- model output from an external coding agent. StackNext does not control the
  client or its logging policy.

## Threat model

StackNext trusts the local developer and the loopback network. It does not trust
incoming telemetry or browser requests:

- Every ingest envelope is Zod-validated and size-capped before storage.
- Read APIs require the bearer token or a dashboard session cookie.
- Cross-site browser requests are rejected.
- Captured attributes pass through app-side and collector-side redaction.
- The MCP server only performs GETs against the loopback collector and exposes
  read-only tools.
- Regression records are private local files with atomic writes and strict
  schemas.

If you find a way to cross one of those boundaries, report it privately.

## Dependency reports

Run:

```bash
pnpm audit --prod
```

For a vulnerable dependency, include the advisory id, the dependency path and
whether the vulnerable code is reachable in a published package. We will
upgrade, patch or document the limitation as appropriate.

## Release verification

Release archives are packed and inspected by `pnpm test:packages`. The checks
cover unresolved `workspace:` ranges, missing exports/declarations, README and
LICENSE presence, the CLI executable bit, forbidden source/test/runtime files,
known secret patterns and archive size. The release workflow publishes with npm
provenance and requires environment approval. See
[docs/releasing.md](docs/releasing.md).
