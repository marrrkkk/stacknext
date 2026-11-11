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
used as `metadataBase`, resolves canonical links and populates
`app/sitemap.ts` and `app/robots.ts`.

Without it the page still builds and renders, but the canonical origin, sitemap
entries and social image tags are omitted rather than pointing at an invented
domain. `robots.txt` still allows crawling; it just omits the sitemap and host
directives.

Search-engine surfaces live in code, not static files:

- `app/sitemap.ts` lists every public route. Add a new public route here too.
- `app/robots.ts` allows crawling of all routes. There are no private paths on
  this site.
- `content/metadata.ts` owns titles, descriptions, canonical links, Open Graph
  and Twitter metadata. New pages should use `pageMetadata()`.
- `content/structured-data.ts` owns the JSON-LD graph: `Organization`,
  `WebSite`, `SoftwareApplication`, the landing-page `FAQPage`, and
  `BreadcrumbList` for content pages. Keep it aligned with visible content.
- `app/og/[slug]/route.tsx` generates 1200×630 cards with `next/og` from
  `components/og-image.tsx`; the copy lives in `content/og.ts`. Add an entry
  there for every public route. `pageMetadata()` links the matching card only
  when `NEXT_PUBLIC_SITE_URL` is set, so a local build emits no social image
  tags instead of resolving them against localhost.

After deploying, submit `/sitemap.xml` in Google Search Console and Bing
Webmaster Tools once.
