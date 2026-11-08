import type { TaskStatus } from './schema'

const ACTION_LABEL: Record<TaskStatus, string> = {
  todo: 'Move to doing',
  doing: 'Mark done',
  done: 'Move to todo',
}

/** Label shown on the status button for a task. */
export function nextStatusLabel(status: TaskStatus): string {
  return ACTION_LABEL[status]
}
