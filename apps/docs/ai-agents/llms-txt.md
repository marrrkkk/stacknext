---
title: AI-readable documentation
description: How agents can read the StackNext site as Markdown with Mintlify-generated llms.txt and llms-full.txt.
---

StackNext does not commit a hand-written `llms.txt` or `llms-full.txt`. Mintlify
generates both from the published navigation and page content, so they always
match the site you are reading.

## Generated entry points

| URL | Contents |
| --- | --- |
| `/llms.txt` | A compact index of the documentation with links and short descriptions. |
| `/llms-full.txt` | The full text of the documentation in one file. |
| `<page>.md` | A Markdown version of an individual page, for example `/guides/diagnostics.md`. |
| Any page with `Accept: text/markdown` | The same Markdown representation through content negotiation. |

These endpoints are produced by the documentation host. Do not add generated
`llms.txt` or `llms-full.txt` files to the repository; `pnpm check:docs` rejects
manual copies.

## Recommended agent flow

1. Start with `/llms.txt` when you need to discover pages.
2. Fetch the specific page as `.md` instead of scraping the rendered HTML.
3. For package APIs, prefer the version-matched files under
   `node_modules/@stacknext/<package>/docs/`. They ship inside the npm archive
   and match the installed version.
4. Use `/llms-full.txt` only when a broad, one-shot corpus is cheaper than
   targeted reads.
5. Treat diagnostics and regression results as evidence. Read the status,
   completeness metadata and limitations before drawing conclusions.

## Site instructions for models

`apps/docs/docs.json` contains `markdown.instructions`. Mintlify includes those
instructions with the generated Markdown so an agent knows the audience split:
conceptual guides live on this site, package reference ships in the packages,
and local installed docs take precedence for API details.

## Related

- [AI agent support](index)
- [Local package documentation](local-docs)
- [MCP server](../mcp)
- [Agent Skill](skill)
