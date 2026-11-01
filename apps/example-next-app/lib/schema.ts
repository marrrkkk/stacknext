import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  createdAt: integer('created_at').notNull(),
})

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: text('status', { enum: ['todo', 'doing', 'done'] })
    .notNull()
    .default('todo'),
  priority: integer('priority').notNull().default(2),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
})

export const schema = { projects, tasks }

export type Project = typeof projects.$inferSelect
export type Task = typeof tasks.$inferSelect
