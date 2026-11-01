import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createNextScopeDrizzleLogger } from '@nextscope/drizzle'
import { projects, schema, tasks } from './schema'

export type DemoDatabase = ReturnType<typeof createDatabase>

interface DatabaseGlobal {
  __nextscopeDemoDatabase?: DemoDatabase
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  priority INTEGER NOT NULL DEFAULT 2,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks(project_id);
`

function seed(client: Database.Database): void {
  const count = client.prepare('SELECT COUNT(*) AS count FROM projects').get() as {
    count: number
  }
  if (count.count > 0) return

  const now = Date.now()
  const day = 86_400_000
  client
    .prepare('INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)')
    .run(1, 'Launch website', 'Ship the marketing site and onboarding flow.', now - day * 12)
  client
    .prepare('INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)')
    .run(2, 'Billing migration', 'Move invoices to the new billing provider.', now - day * 6)
  client
    .prepare('INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)')
    .run(3, 'Search relevance', 'Tune ranking for the internal knowledge base.', now - day * 3)

  const insertTask = client.prepare(
    `INSERT INTO tasks (project_id, title, status, priority, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const rows: Array<[number, string, string, number, number, number | null]> = [
    [1, 'Draft landing page copy', 'done', 1, now - day * 11, now - day * 9],
    [1, 'Wire up signup form', 'done', 2, now - day * 10, now - day * 8],
    [1, 'Add pricing page', 'doing', 1, now - day * 4, null],
    [1, 'Accessibility pass', 'todo', 2, now - day * 2, null],
    [2, 'Audit current invoice schema', 'done', 1, now - day * 5, now - day * 4],
    [2, 'Backfill historical invoices', 'doing', 1, now - day * 3, null],
    [2, 'Reconcile webhook retries', 'todo', 3, now - day * 1, null],
    [3, 'Collect query logs', 'done', 2, now - day * 2, now - day * 1],
    [3, 'Evaluate embedding models', 'todo', 2, now - day * 1, null],
  ]
  for (const row of rows) {
    insertTask.run(...row)
  }
}

function createDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  const dataDir = path.join(process.cwd(), 'data')
  mkdirSync(dataDir, { recursive: true })
  const client = new Database(path.join(dataDir, 'nextscope-demo.db'))
  client.pragma('journal_mode = WAL')
  client.pragma('foreign_keys = ON')
  client.exec(SCHEMA_SQL)
  seed(client)

  return drizzle(client, {
    schema,
    logger: createNextScopeDrizzleLogger({ databaseSystem: 'sqlite' }),
  })
}

const globalForDatabase = globalThis as typeof globalThis & DatabaseGlobal

export const db: DemoDatabase =
  globalForDatabase.__nextscopeDemoDatabase ?? createDatabase()

if (process.env.NODE_ENV !== 'production') {
  globalForDatabase.__nextscopeDemoDatabase = db
}

export function resetDemoData(): void {
  const client = db.$client
  client.prepare('DELETE FROM tasks').run()
  client.prepare('DELETE FROM projects').run()
  seed(client)
}

export { projects, tasks }
