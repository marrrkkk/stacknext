import { randomUUID } from 'node:crypto'
import type { Command } from 'commander'
import {
  CASE_EVIDENCE_KINDS,
  caseEventSchema,
  type CaseEvidence,
  type CaseEvidenceKind,
  type CaseEvent,
  type CaseView,
} from '@stacknext/core'
import {
  appendCaseEvent,
  caseEventPath,
  createCaseEventFile,
  isValidCaseId,
  listCaseViews,
  loadCaseView,
  MAX_EVIDENCE_PER_CASE,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  redactCaseText,
} from '../cases-storage.js'
import { printCheck, printSection, style } from '../output.js'
import { detectProject } from '../project.js'

export interface CaseNewOptions {
  title?: string
  hypothesis?: string
  evidence?: string[]
  session?: string
  json?: boolean
}

export interface CaseAddOptions {
  evidence?: string
  note?: string
  session?: string
  json?: boolean
}

export interface CaseNoteOptions {
  text?: string
  session?: string
  json?: boolean
}

export interface CaseCloseOptions {
  status?: string
  session?: string
  json?: boolean
}

export interface CaseListOptions {
  json?: boolean
}

export interface CaseShowOptions {
  json?: boolean
}

function actorOf(session: string | undefined): string {
  const value = session?.trim() ?? ''
  if (value === '') return 'human'
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new Error('--session must be an opaque id of at most 128 characters')
  }
  return value
}

function parseEvidence(value: string): CaseEvidence {
  const separator = value.indexOf(':')
  if (separator < 1) {
    throw new Error(`Invalid evidence "${value}"; expected <kind>:<id>`)
  }
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (!(CASE_EVIDENCE_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Invalid evidence kind "${kind}"`)
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) {
    throw new Error(`Invalid evidence id "${id}"`)
  }
  return { kind: kind as CaseEvidenceKind, id }
}

function now(): number {
  return Date.now()
}

function emit(view: CaseView, json: boolean, message: string): void {
  if (json) console.log(JSON.stringify(view, null, 2))
  else {
    printCheck('pass', message, `${view.id} · ${view.status} · ${view.evidence.length} evidence`)
  }
}

export async function runCaseNew(
  options: CaseNewOptions,
  cwd = process.cwd(),
): Promise<number> {
  const title = options.title?.trim() ?? ''
  if (title === '') throw new Error('--title is required')
  const evidence = (options.evidence ?? []).map(parseEvidence)
  if (evidence.length > MAX_EVIDENCE_PER_CASE) {
    throw new Error(`A case can start with at most ${MAX_EVIDENCE_PER_CASE} evidence ids`)
  }
  const project = await detectProject(cwd)
  const id = `case_${randomUUID()}`
  const event: CaseEvent = {
    kind: 'created',
    at: now(),
    actor: actorOf(options.session),
    title: redactCaseText(title, MAX_TITLE_LENGTH),
    hypothesis: options.hypothesis
      ? redactCaseText(options.hypothesis, 2_000)
      : null,
    evidence,
    agentSessionId: options.session ?? null,
  }
  caseEventSchema.parse(event)
  await createCaseEventFile(project.dir, id, event)
  const view = (await loadCaseView(project.dir, id)) as CaseView
  emit(view, options.json === true, 'Created investigation case')
  return 0
}

async function resolveCase(
  cwd: string,
  id: string,
): Promise<{ projectDir: string; view: CaseView }> {
  if (!isValidCaseId(id)) throw new Error(`Invalid case id "${id}"`)
  const project = await detectProject(cwd)
  const view = await loadCaseView(project.dir, id)
  if (!view) throw new Error(`No case found with id ${id}`)
  return { projectDir: project.dir, view }
}

export async function runCaseAdd(
  id: string,
  options: CaseAddOptions,
  cwd = process.cwd(),
): Promise<number> {
  const { projectDir } = await resolveCase(cwd, id)
  if (!options.evidence) throw new Error('--evidence <kind>:<id> is required')
  await appendCaseEvent(projectDir, id, {
    kind: 'evidence_added',
    at: now(),
    actor: actorOf(options.session),
    evidence: parseEvidence(options.evidence),
  })
  if (options.note?.trim()) {
    await appendCaseEvent(projectDir, id, {
      kind: 'note_added',
      at: now(),
      actor: actorOf(options.session),
      text: redactCaseText(options.note, MAX_NOTE_LENGTH),
    })
  }
  const view = (await loadCaseView(projectDir, id)) as CaseView
  emit(view, options.json === true, 'Added evidence to case')
  return 0
}

export async function runCaseNote(
  id: string,
  options: CaseNoteOptions,
  cwd = process.cwd(),
): Promise<number> {
  const { projectDir } = await resolveCase(cwd, id)
  if (!options.text?.trim()) throw new Error('--text is required')
  await appendCaseEvent(projectDir, id, {
    kind: 'note_added',
    at: now(),
    actor: actorOf(options.session),
    text: redactCaseText(options.text, MAX_NOTE_LENGTH),
  })
  const view = (await loadCaseView(projectDir, id)) as CaseView
  emit(view, options.json === true, 'Added note to case')
  return 0
}

export async function runCaseClose(
  id: string,
  options: CaseCloseOptions,
  cwd = process.cwd(),
): Promise<number> {
  const { projectDir } = await resolveCase(cwd, id)
  const status = options.status
  if (status !== 'verified' && status !== 'refuted' && status !== 'abandoned') {
    throw new Error('--status must be verified, refuted or abandoned')
  }
  await appendCaseEvent(projectDir, id, {
    kind: 'closed',
    at: now(),
    actor: actorOf(options.session),
    status,
  })
  const view = (await loadCaseView(projectDir, id)) as CaseView
  emit(view, options.json === true, 'Closed case')
  return 0
}

export async function runCaseList(
  options: CaseListOptions,
  cwd = process.cwd(),
): Promise<number> {
  const project = await detectProject(cwd)
  const { items, dropped } = await listCaseViews(project.dir)
  if (options.json) {
    console.log(
      JSON.stringify({ items, total: items.length, limit: items.length, offset: 0, dropped }, null, 2),
    )
  } else {
    printSection('Investigation cases')
    if (items.length === 0) console.log(style.dim('No cases yet. Create one with "stacknext case new".'))
    for (const view of items) {
      console.log(
        `${style.bold(view.id)} ${style.dim(view.status)} — ${view.title} (${view.evidence.length} evidence)`,
      )
    }
  }
  return 0
}

export async function runCaseShow(
  id: string,
  options: CaseShowOptions,
  cwd = process.cwd(),
): Promise<number> {
  const { projectDir, view } = await resolveCase(cwd, id)
  if (options.json) console.log(JSON.stringify(view, null, 2))
  else {
    printSection(`Case ${view.id}`)
    console.log(`${view.title} · ${view.status}`)
    if (view.hypothesis) console.log(`Hypothesis: ${view.hypothesis}`)
    console.log(`${view.evidence.length} evidence id(s); ${view.events.length} event(s).`)
    console.log(style.dim(`Events file: ${caseEventPath(projectDir, id)}`))
  }
  return 0
}

export function registerCaseCommand(program: Command, cwd: string): void {
  const cases = program.command('case').description('Manage local, append-only investigation cases')

  cases
    .command('new')
    .description('Create a case with a title and optional evidence')
    .option('--title <title>', 'short case title')
    .option('--hypothesis <text>', 'falsifiable hypothesis')
    .option('--evidence <kind:id>', 'evidence id (repeatable)', (value: string, previous: string[]) => [...previous, value], [] as string[])
    .option('--session <id>', 'agent session id (defaults to human)')
    .option('--json', 'print the case as JSON')
    .action(async (options: CaseNewOptions) => {
      const code = await runCaseNew(options, cwd)
      if (code !== 0) process.exitCode = code
    })

  cases
    .command('add')
    .description('Append one evidence id to a case')
    .argument('<id>', 'case id')
    .option('--evidence <kind:id>', 'evidence id')
    .option('--note <text>', 'optional note appended with the evidence')
    .option('--session <id>', 'agent session id')
    .option('--json', 'print the case as JSON')
    .action(async (id: string, options: CaseAddOptions) => {
      const code = await runCaseAdd(id, options, cwd)
      if (code !== 0) process.exitCode = code
    })

  cases
    .command('note')
    .description('Append a redacted note to a case')
    .argument('<id>', 'case id')
    .option('--text <text>', 'note text')
    .option('--session <id>', 'agent session id')
    .option('--json', 'print the case as JSON')
    .action(async (id: string, options: CaseNoteOptions) => {
      const code = await runCaseNote(id, options, cwd)
      if (code !== 0) process.exitCode = code
    })

  cases
    .command('close')
    .description('Append a terminal status to a case')
    .argument('<id>', 'case id')
    .option('--status <status>', 'verified, refuted or abandoned')
    .option('--session <id>', 'agent session id')
    .option('--json', 'print the case as JSON')
    .action(async (id: string, options: CaseCloseOptions) => {
      const code = await runCaseClose(id, options, cwd)
      if (code !== 0) process.exitCode = code
    })

  cases
    .command('list')
    .description('List local investigation cases')
    .option('--json', 'print machine-readable cases')
    .action(async (options: CaseListOptions) => {
      const code = await runCaseList(options, cwd)
      if (code !== 0) process.exitCode = code
    })

  cases
    .command('show')
    .description('Show one investigation case')
    .argument('<id>', 'case id')
    .option('--json', 'print the case as JSON')
    .action(async (id: string, options: CaseShowOptions) => {
      const code = await runCaseShow(id, options, cwd)
      if (code !== 0) process.exitCode = code
    })
}
