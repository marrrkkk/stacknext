import { access, chmod, mkdir, open, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  CASE_FORMAT_VERSION,
  caseEventSchema,
  foldCaseEvents,
  redactText,
  type CaseEvent,
  type CaseView,
} from '@stacknext/core'

export const MAX_CASES = 200
export const MAX_EVENTS_PER_CASE = 500
export const MAX_EVIDENCE_PER_CASE = 100
export const MAX_TITLE_LENGTH = 200
export const MAX_NOTE_LENGTH = 2_000

const CASE_ID_PATTERN =
  /^case_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidCaseId(id: string): boolean {
  return CASE_ID_PATTERN.test(id)
}

export function casesDir(projectDir: string): string {
  return path.join(projectDir, '.stacknext', 'cases')
}

export function caseEventPath(projectDir: string, id: string): string {
  return path.join(casesDir(projectDir), id, 'events.jsonl')
}

export function redactCaseText(value: string, maxLength: number): string {
  return redactText(value, maxLength)
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

/** Creates one case directory and its first append-only event. */
export async function createCaseEventFile(
  projectDir: string,
  id: string,
  event: CaseEvent,
): Promise<void> {
  if (!isValidCaseId(id)) throw new Error(`Invalid case id "${id}"`)
  const root = casesDir(projectDir)
  const directory = path.join(root, id)
  const existing = await readdir(root).catch(() => [] as string[])
  if (existing.length >= MAX_CASES) {
    throw new Error(`Case cap reached (${MAX_CASES}); no new case was created`)
  }
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  const file = caseEventPath(projectDir, id)
  if (await exists(file)) throw new Error(`Case ${id} already exists`)
  const handle = await open(file, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(event)}\n`, 'utf8')
  } finally {
    await handle.close()
  }
  await chmod(file, 0o600)
}

/** Appends exactly one event; never rewrites or truncates earlier lines. */
export async function appendCaseEvent(
  projectDir: string,
  id: string,
  event: CaseEvent,
): Promise<CaseView> {
  if (!isValidCaseId(id)) throw new Error(`Invalid case id "${id}"`)
  const file = caseEventPath(projectDir, id)
  if (!(await exists(file))) throw new Error(`No case found with id ${id}`)
  const { events } = await readCaseEvents(projectDir, id)
  if (events.length >= MAX_EVENTS_PER_CASE) {
    throw new Error(`Case ${id} reached the ${MAX_EVENTS_PER_CASE} event cap`)
  }
  if (event.kind === 'evidence_added') {
    const current = foldCaseEvents(events, id)
    if (current && current.evidence.length >= MAX_EVIDENCE_PER_CASE) {
      throw new Error(`Case ${id} reached the ${MAX_EVIDENCE_PER_CASE} evidence cap`)
    }
  }
  const handle = await open(file, 'a', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(event)}\n`, 'utf8')
  } finally {
    await handle.close()
  }
  await chmod(file, 0o600)
  const view = await loadCaseView(projectDir, id)
  if (!view) throw new Error(`Case ${id} could not be read after appending`)
  return view
}

export async function readCaseEvents(
  projectDir: string,
  id: string,
): Promise<{ events: CaseEvent[]; dropped: number }> {
  if (!isValidCaseId(id)) return { events: [], dropped: 0 }
  let raw: string
  try {
    raw = await readFile(caseEventPath(projectDir, id), 'utf8')
  } catch {
    return { events: [], dropped: 0 }
  }
  const events: CaseEvent[] = []
  let dropped = 0
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue
    try {
      const parsed: unknown = JSON.parse(line)
      const result = caseEventSchema.safeParse(parsed)
      if (result.success) events.push(result.data)
      else dropped += 1
    } catch {
      dropped += 1
    }
  }
  return { events, dropped }
}

export async function loadCaseView(
  projectDir: string,
  id: string,
): Promise<CaseView | null> {
  const { events } = await readCaseEvents(projectDir, id)
  return foldCaseEvents(events, id)
}

export async function listCaseViews(
  projectDir: string,
): Promise<{ items: CaseView[]; dropped: number }> {
  const root = casesDir(projectDir)
  const directories = (await readdir(root).catch(() => [] as string[]))
    .filter(isValidCaseId)
    .sort()
    .reverse()
    .slice(0, MAX_CASES)
  const items: CaseView[] = []
  let dropped = 0
  for (const id of directories) {
    const { events, dropped: invalid } = await readCaseEvents(projectDir, id)
    dropped += invalid
    const view = foldCaseEvents(events, id)
    if (view) items.push(view)
    else dropped += 1
  }
  items.sort((a, b) => b.updatedAt - a.updatedAt)
  return { items, dropped }
}

export function caseFormatVersion(): number {
  return CASE_FORMAT_VERSION
}
