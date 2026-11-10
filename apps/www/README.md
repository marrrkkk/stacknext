# @stacknext/www

The StackNext website: the landing page plus `/privacy`, `/license`,
`/changelog` and `/limitations`. Private Next.js App Router app, dark-only,
with no client-side requests to third parties.

```bash
pnpm --filter @stacknext/www dev
pnpm --filter @stacknext/www build
pnpm --filter @stacknext/www start
```

The dev server uses `http://127.0.0.1:4403`.

## Changelog data

`app/changelog/page.tsx` imports `content/changelog.generated.ts`, which is
generated from the repository root `CHANGELOG.md` by
`scripts/sync-changelog.mjs`. Run `pnpm changelog:sync` after editing the
changelog, and do not edit the generated module by hand. `pnpm check:docs`
includes the stale-output check.

## Deployment metadata

Set `NEXT_PUBLIC_SITE_URL` to the deployed origin, for example
`https://stacknext.example`, before building a public deployment. The value is
used as `metadataBase` and to resolve the absolute `/og.png` social image.

Without it the page still builds and renders, but the canonical origin and
social image tags are omitted rather than pointing at an invented domain.
