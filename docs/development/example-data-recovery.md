# Example data recovery

`apps/example` uses its own `data/stacknext-demo.db` and
`.stacknext/baselines/`. It does not automatically migrate data from the former
`apps/example-next-app`. Stop both apps before recovering data and keep a backup
of both directories, including SQLite `-wal` and `-shm` files. Do not delete the
former app's files.

The old and new database schemas match. Use SQLite's backup API (available via
the app's `better-sqlite3` dependency) to create a consistent database in a new,
unused recovery directory, rather than copying an open database file. From
`apps/example`, after dependencies are installed:

```bash
node --input-type=module <<'JS'
import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
const destination = 'data/recovered/stacknext-demo.db'
mkdirSync('data/recovered', { recursive: true })
if (existsSync(destination)) throw new Error('Recovery destination already exists')
const source = new Database('../example-next-app/data/stacknext-demo.db', {
  readonly: true, fileMustExist: true,
})
try { await source.backup(destination) } finally { source.close() }
JS
STACKNEXT_EXAMPLE_DATA_DIR="$PWD/data/recovered" pnpm exec stacknext dev --open
```

This preserves the new database even if it has already been seeded. The recovered
database becomes the selected database; the app does not merge tasks or resolve
conflicting ids. Keep using the same data-directory override on later starts. Do
not call `/api/seed` on the recovered database: that resets its tasks.

For baselines, use the
[documented artifact portability workflow](../../apps/docs/regression-testing.mdx#sharing-and-portability):
copy individual immutable `base-*.json` records from the former app's
`.stacknext/baselines/` into the new app's `.stacknext/baselines/` only when the
destination id is absent. Create the directory with mode `0700`, retain `0600`
file permissions, and never overwrite an existing record or copy `run.json`. If
an id already exists, retain both originals in their current directories and
inspect them with `stacknext baseline show <id>` from each app directory. The CLI
has no baseline import or merge command. Validate recovered records with
`stacknext baseline list` and `stacknext baseline show <id>` from the new app.
Old baselines retain their scenario identities and project/environment metadata;
changed identities or environments can make comparisons inconclusive. Capture a
new baseline for the rebuilt app using the
[baseline workflow](../../apps/docs/regression-testing.mdx#create-a-baseline).

For isolated Playwright captures, start a dedicated runtime with
`STACKNEXT_EXAMPLE_DATA_DIR="$PWD/data/e2e" pnpm exec stacknext dev`. The example
tests reset `/api/seed` before every repetition; use this dedicated database for
direct Playwright runs as well. `pnpm test:e2e` starts it automatically and
requires any existing example runtime to be stopped first.
