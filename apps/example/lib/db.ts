import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createStackNextDrizzleLogger } from '@stacknext/drizzle'
import { projects, schema, tasks } from './schema'

export type DemoDatabase = ReturnType<typeof createDatabase>

interface DatabaseGlobal {
  __stacknextExampleDatabase?: DemoDatabase
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

const SEED_PROJECTS: Array<[number, string, string, number]> = [
  [1, 'Launch website', 'Ship the marketing site and the first-run onboarding flow.', 12],
  [2, 'Billing migration', 'Move invoices and webhook retries to the new billing provider.', 6],
  [3, 'Search relevance', 'Tune ranking for the internal knowledge base search.', 3],
]

const SEED_TASKS: Array<[number, string, 'todo' | 'doing' | 'done', number, number]> = [
  [1, 'Draft landing page copy', 'done', 1, 11],
  [1, 'Wire up the signup form', 'done', 2, 10],
  [1, 'Add a pricing page', 'doing', 1, 4],
  [1, 'Accessibility pass on the nav', 'todo', 2, 2],
  [2, 'Audit the current invoice schema', 'done', 1, 5],
  [2, 'Backfill historical invoices', 'doing', 1, 3],
  [2, 'Reconcile webhook retries', 'todo', 3, 1],
  [3, 'Collect query logs', 'done', 2, 2],
  [3, 'Evaluate embedding models', 'todo', 2, 1],
  [3, 'Write the relevance test set', 'todo', 3, 1],
]

function seed(client: Database.Database): void {
  // Next.js build workers can import this module concurrently. Take an
  // immediate write lock before the count so only one worker seeds the demo.
  const runSeed = client.transaction(() => {
    const count = client.prepare('SELECT COUNT(*) AS count FROM projects').get() as {
      count: number
    }
    if (count.count > 0) return

    const now = Date.now()
    const day = 86_400_000
    const insertProject = client.prepare(
      'INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)',
    )
    for (const [id, name, description, daysAgo] of SEED_PROJECTS) {
      insertProject.run(id, name, description, now - day * daysAgo)
    }

    const insertTask = client.prepare(
      `INSERT INTO tasks (project_id, title, status, priority, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const [projectId, title, status, priority, daysAgo] of SEED_TASKS) {
      const createdAt = now - day * daysAgo
      insertTask.run(
        projectId,
        title,
        status,
        priority,
        createdAt,
        status === 'done' ? createdAt + day : null,
      )
    }
  })
  runSeed.immediate()
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Next.js build workers evaluate route modules in parallel. Switching a fresh
 * database to WAL can return SQLITE_BUSY while another worker holds a lock, so
 * retry the idempotent initialization instead of failing the build.
 */
function initializeDatabase(client: Database.Database): void {
  const deadline = Date.now() + 10_000
  for (;;) {
    try {
      client.pragma('journal_mode = WAL')
      client.pragma('foreign_keys = ON')
      client.exec(SCHEMA_SQL)
      seed(client)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'SQLITE_BUSY' || Date.now() >= deadline) throw error
      sleepSync(25 + Math.floor(Math.random() * 50))
    }
  }
}

function createDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  const dataDir = path.join(process.cwd(), 'data')
  mkdirSync(dataDir, { recursive: true })
  const client = new Database(path.join(dataDir, 'stacknext-demo.db'))
  client.pragma('busy_timeout = 5000')
  initializeDatabase(client)

  return drizzle(client, {
    schema,
    logger: createStackNextDrizzleLogger({ databaseSystem: 'sqlite' }),
  })
}

const globalForDatabase = globalThis as typeof globalThis & DatabaseGlobal

export const db: DemoDatabase =
  globalForDatabase.__stacknextExampleDatabase ?? createDatabase()

if (process.env.NODE_ENV !== 'production') {
  globalForDatabase.__stacknextExampleDatabase = db
}

export function resetDemoData(): void {
  const client = db.$client
  client.prepare('DELETE FROM tasks').run()
  client.prepare('DELETE FROM projects').run()
  seed(client)
}

export { projects, tasks }
