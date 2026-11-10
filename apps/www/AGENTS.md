# AGENTS.md — apps/www

Scope: the private StackNext marketing website. Read the root
[`AGENTS.md`](../../AGENTS.md) first; repository-wide rules still apply.

## What this app is

A private Next.js App Router site with the landing page plus `/privacy`,
`/license`, `/limitations` and `/changelog`. It is not published from this
repository and is not part of the StackNext runtime.

## Rules

- Do not add third-party analytics, remote fonts, tracking pixels or
  client-side requests to external services.
- Product claims must match the supported surface in
  [`apps/docs/limitations.md`](../docs/limitations.md) and the root
  `AGENTS.md`. Do not imply production, Edge, Pages Router or cloud support.
- Links to product documentation point at `apps/docs/` paths through
  `content/site.ts`. Keep those URLs stable.
- `content/changelog.generated.ts` is generated from the root `CHANGELOG.md` by
  `scripts/sync-changelog.mjs`. Never edit it by hand; run
  `pnpm changelog:sync`.
- `NEXT_PUBLIC_SITE_URL` is optional. Without it the build omits the canonical
  origin and absolute social-image tags instead of inventing a domain.
- Keep the dark-only design system and existing brand assets consistent. Do not
  introduce a second product name or logo.

## Verification

```bash
pnpm --filter @stacknext/www typecheck
pnpm --filter @stacknext/www build
pnpm check:docs
```

Run `pnpm --filter @stacknext/www dev` on `http://127.0.0.1:4403` for a visual
check. Do not add generated `.next` output or local build artifacts to commits.
