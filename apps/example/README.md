# StackNext Example

A small task tracker that exists to produce real Next.js telemetry for the
StackNext collector. The UI uses the same design tokens, shell, cards, tables
and chips as the dashboard, so moving between the app and the inspector feels
like one product.

- Next.js 16 App Router, Node.js runtime
- Drizzle ORM with better-sqlite3, seeded on first use
- `@stacknext/next` instrumentation plus the Drizzle query logger
- Three annotated Playwright scenarios for baseline/candidate comparisons

## Run it

From this directory:

```bash
pnpm exec stacknext dev --open   # dashboard on http://127.0.0.1:4400
```

The app is on `http://127.0.0.1:4402`. `stacknext dev` starts both the collector
and the app, so run it as a single command.

The database is `data/stacknext-demo.db`. Use **Reset demo data** on the overview
or `POST /api/seed` to restore the seeded projects and tasks.

## What to look at

| Page | Purpose |
| --- | --- |
| `/` | Overview, start-here steps, featured scenarios, projects |
| `/projects` | All seeded projects |
| `/projects/1` | Project detail, JSON link, add-task and status Server Actions |
| `/scenarios` | Evidence map with curl snippets and one-click traffic sample |
| `/actions-demo` | Successful, failing and control-flow Server Actions |

## Demo routes

Every route below is real and local. Error routes use fake secrets so you can
confirm redaction in the dashboard, CLI and MCP output.

| Route | Demonstrates |
| --- | --- |
| `/api/projects` | A Drizzle aggregate behind a JSON route handler |
| `/api/projects/1/tasks` | A parameterized project read |
| `/api/slow?delay=350` | Slow-request detection above the 250 ms threshold |
| `/api/n-plus-one` | Eight repeated task queries (N+1 finding) |
| `/api/n-plus-one-fixed` | The same data in one batched query |
| `/api/slow-db` | A CPU-bound query in a manual database span |
| `/api/repeated-fetch` | Three uncached calls to the same internal route |
| `/api/custom-work` | Nested `withStackNextSpan` helpers and redaction |
| `/api/error?token=demo-url-secret` | A thrown error with secrets in the message and URL |
| `/api/actions-demo?case=success` | A wrapped, successful Server Action |
| `/api/actions-demo?case=failure` | A wrapped action failure with a redacted message |
| `/api/actions-demo?case=redirect` | `redirect()` as control flow |
| `/api/actions-demo?case=not-found` | `notFound()` as control flow |
| `/api/actions-demo?case=concurrent` | Three sibling action spans |
| `/api/seed` (POST) | Restore the seeded data |

## Playwright scenarios

The captured suite uses explicit annotations, so the ids stay stable even when
titles change:

- `example.overview`
- `example.project-detail`
- `example.n-plus-one`

```bash
# Warm the routes before a baseline capture.
curl -s http://127.0.0.1:4402/ >/dev/null
curl -s http://127.0.0.1:4402/projects/1 >/dev/null
curl -s http://127.0.0.1:4402/api/n-plus-one >/dev/null

pnpm exec stacknext capture --name "example baseline" -- pnpm exec playwright test --workers=1 --repeat-each=3
pnpm exec stacknext baseline save <run-id> --name "example baseline"
```

## Privacy

Query strings, cookies, request bodies, headers and SQL parameters are never
captured. URL paths are kept; sensitive values become `[redacted]`. The example
never sends telemetry outside `127.0.0.1`.
