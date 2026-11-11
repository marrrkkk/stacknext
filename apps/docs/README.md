# StackNext public documentation

This directory is the Mintlify site for StackNext. It contains only
user-facing product documentation: concepts, installation, guides,
integrations, AI-agent support, reference, troubleshooting and privacy.

```bash
pnpm docs:dev    # from the repository root
```

`docs.json` defines navigation, redirects and the model instructions that
Mintlify includes in AI-readable output. The site is deployed independently from
npm publishing.

## Mintlify deployment

The Mintlify project must have **docs.json is in a subdirectory** enabled with
the path `/apps/docs` in its Git settings. The repository root also contains the
engineering knowledge base under `docs/`, so the default root lookup cannot
find the site configuration. Without this setting the Mintlify GitHub App
reports `Unable to find docs.json` and does not publish previews or production
deployments. The setting is configured in the Mintlify dashboard, not in this
repository.

## Source of truth

- Hand-authored public pages live here as `.mdx` and target developers using
  StackNext, not contributors to the repository.
- Package API reference is canonical in `packages/<package>/docs/` and ships
  inside each npm archive. It is not copied into this site. The only generated
  documentation file is `packages/cli/docs/packages.md`, the installed-package
  index.
- Contributor setup, testing, release, benchmark and architecture documents live
  in the repository engineering knowledge base at
  [`../../docs/`](../../docs/README.md).

Run `pnpm check:docs` from the repository root after changing navigation, links
or package docs. Mintlify generates `/llms.txt`, `/llms-full.txt` and Markdown
page variants automatically; do not commit them. See
[AI-readable documentation](ai-agents/local-docs#ai-readable-documentation).

Repository-level documents: [README](../../README.md),
[CONTRIBUTING](../../CONTRIBUTING.md), [SECURITY](../../SECURITY.md),
[SUPPORT](../../SUPPORT.md) and [AGENTS](../../AGENTS.md).
