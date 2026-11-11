export const LINKS = {
  github: 'https://github.com/marrrkkk/stacknext',
  docs: 'https://stack-next.mintlify.site',
  quickstart: 'https://stack-next.mintlify.site/getting-started/quickstart',
  installation: 'https://stack-next.mintlify.site/installation',
  cli: 'https://stack-next.mintlify.site/cli/commands',
  diagnostics: 'https://stack-next.mintlify.site/guides/diagnostics',
  regression: 'https://stack-next.mintlify.site/regression-testing',
  privacy: '/privacy',
  privacyDocs: 'https://stack-next.mintlify.site/privacy',
  mcp: 'https://stack-next.mintlify.site/mcp',
  snapshots: 'https://stack-next.mintlify.site/guides/snapshots',
  limitations: '/limitations',
  limitationsSource: 'https://stack-next.mintlify.site/limitations',
  npm: 'https://www.npmjs.com/package/@stacknext/cli',
  license: '/license',
  licenseFile: 'https://github.com/marrrkkk/stacknext/blob/main/LICENSE',
  security: 'https://github.com/marrrkkk/stacknext/blob/main/SECURITY.md',
  contributing:
    'https://github.com/marrrkkk/stacknext/blob/main/CONTRIBUTING.md',
  changelog: '/changelog',
  changelogSource:
    'https://github.com/marrrkkk/stacknext/blob/main/CHANGELOG.md',
} as const

export const NAV = [
  { label: 'Product', href: '/#product' },
  { label: 'Docs', href: LINKS.docs },
  { label: 'GitHub', href: LINKS.github },
] as const

export const COMPATIBILITY = [
  { label: 'Next.js 15 / 16', note: 'App Router' },
  { label: 'OpenTelemetry', note: 'Documented spans' },
  { label: 'Drizzle', note: 'Query logger' },
  { label: 'Prisma', note: 'Query events' },
  { label: 'Playwright', note: 'Scenario capture' },
  { label: 'MCP', note: 'Read-only' },
] as const

export const SPECS = [
  { label: 'Runtime', value: 'Next.js 15/16 · Node.js 20.9+' },
  { label: 'Collector', value: '127.0.0.1:4400' },
  { label: 'Store', value: '5,000 spans · 10 minutes' },
  { label: 'Diagnostics', value: '6 deterministic rules' },
  { label: 'Snapshots', value: '64 MiB each · autoKeep 10' },
  { label: 'Records', value: '16 MiB per file' },
  { label: 'MCP', value: '20 read-only tools · 5 prompts' },
] as const

export const ACCESS_PATHS = [
  {
    number: '01',
    title: 'Dashboard',
    description:
      'The full sample: requests, traces, database queries, errors, diagnostics, snapshots and saved test runs.',
    command: 'stacknext dev',
    href: '#tour',
    linkLabel: 'See the dashboard',
    icon: 'dashboard' as const,
  },
  {
    number: '02',
    title: 'CLI',
    description:
      'Coverage, diagnostics, exports, snapshots, captures and comparisons from a terminal.',
    command: 'stacknext diagnose',
    href: LINKS.cli,
    linkLabel: 'CLI reference',
    icon: 'terminal' as const,
  },
  {
    number: '03',
    title: 'MCP',
    description:
      'A read-only server for coding agents: 20 tools, 5 prompts and GET requests over loopback.',
    command: 'stacknext mcp',
    href: LINKS.mcp,
    linkLabel: 'MCP reference',
    icon: 'mcp' as const,
  },
] as const

export interface TourItem {
  id: string
  label: string
  title: string
  description: string
  bullets: string[]
  image: string
  alt: string
  href: string
}

export const TOUR: TourItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    title: 'The current sample at a glance.',
    description:
      'Requests, latency, database activity, errors, coverage and open findings, with the retention window always visible.',
    bullets: [
      'The store is capped, and drop counters show when it fills.',
      'Coverage reports what this sample observed, not a score.',
      'Updates live while the collector runs.',
    ],
    image: 'overview',
    alt: 'StackNext overview dashboard showing requests, latency, database activity, errors and diagnostics',
    href: LINKS.docs,
  },
  {
    id: 'traces',
    label: 'Traces',
    title: 'Follow a request through its spans.',
    description:
      'Open a route to see status, duration, server spans, database queries and any correlated errors on one timeline.',
    bullets: [
      'Built from documented Next.js telemetry only.',
      'Manual span helpers preserve return values and errors.',
      'Missing parents are reported, never guessed.',
    ],
    image: 'traces',
    alt: 'StackNext trace detail view showing a request timeline, server spans and correlated errors',
    href: LINKS.docs,
  },
  {
    id: 'database',
    label: 'Database',
    title: 'See the query without the values.',
    description:
      'Drizzle and Prisma events share the request timeline. SQL text is redacted, and bind parameters are never captured.',
    bullets: [
      'Repeated query shapes surface as N+1 signals.',
      'Drizzle durations are marked unmeasured, not zero.',
      'Slow query spans keep their documented attributes.',
    ],
    image: 'database',
    alt: 'StackNext database view showing normalized query shapes and query durations',
    href: LINKS.docs,
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    title: 'Findings with the evidence attached.',
    description:
      'Six rules run over the current sample: N+1 queries, slow requests, slow spans, repeated external HTTP, error fingerprints and server error responses.',
    bullets: [
      'Findings are marked possible or observed, never confirmed root causes.',
      'Evidence is capped and re-sanitized before it is shown.',
      'Read the evidence and limits before you change code.',
    ],
    image: 'diagnostics',
    alt: 'StackNext diagnostics view showing deterministic findings with severity and status',
    href: LINKS.diagnostics,
  },
  {
    id: 'regression',
    label: 'Regression',
    title: 'Check a flow against a baseline.',
    description:
      'Playwright scenarios are tied to the server trace that ran them, then compared with a saved baseline using medians and explicit thresholds.',
    bullets: [
      'Correlation needs the injected trace id and a matching parent span.',
      'Ambiguous samples make the comparison inconclusive.',
      'Report-only unless you pass --fail-on.',
    ],
    image: 'regression',
    alt: 'StackNext regression comparison view showing a Playwright scenario compared with a saved baseline',
    href: LINKS.regression,
  },
]

export const FAQS = [
  {
    question: 'Is StackNext free?',
    answer:
      "Yes. It's open source under MIT. There's no account, paid plan or hosted service.",
  },
  {
    question: 'Does any data leave my machine?',
    answer:
      "StackNext never uploads data. The collector listens on loopback and has no cloud, analytics or telemetry endpoint. If you connect a hosted coding agent over MCP, that agent's own policy applies to what it reads.",
  },
  {
    question: 'Which Next.js versions are supported?',
    answer:
      'Next.js 15 and 16 with the App Router on the Node.js runtime. Edge runtime and the Pages Router are not supported.',
  },
  {
    question: 'Does it replace my existing OpenTelemetry setup?',
    answer:
      'No. StackNext uses documented Next.js telemetry, and registerStackNext() yields to an existing OpenTelemetry provider instead of starting a second SDK.',
  },
  {
    question: 'Do I need Drizzle, Prisma or Playwright?',
    answer:
      'No. The core install is @stacknext/cli and @stacknext/next. The Drizzle, Prisma and Playwright integrations are optional.',
  },
  {
    question: 'Is this a production APM?',
    answer:
      "No. It's a local development tool with a fixed-size sample. It has no TLS, multi-user auth or production hardening.",
  },
  {
    question: 'Does it work with AI coding agents?',
    answer:
      'Yes. StackNext ships a read-only MCP server, so agents such as Claude Code, Codex and OpenCode can query the live sample and diagnostics. Findings still come from deterministic rules, not model output, and no AI provider is bundled.',
  },
  {
    question: 'Can I use it in CI?',
    answer:
      'Yes, for capture and compare workflows. Comparisons are report-only unless you pass --fail-on regression, --fail-on inconclusive or --fail-on any.',
  },
] as const

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const

export type PackageManager = (typeof PACKAGE_MANAGERS)[number]

export const INSTALL_COMMANDS: Record<PackageManager, string> = {
  npm: 'npm install --save-dev @stacknext/cli @stacknext/next',
  pnpm: 'pnpm add -D @stacknext/cli @stacknext/next',
  yarn: 'yarn add -D @stacknext/cli @stacknext/next',
  bun: 'bun add -d @stacknext/cli @stacknext/next',
}

export const FOOTER_GROUPS = [
  {
    label: 'Product',
    links: [
      { label: 'Overview', href: '/#product' },
      { label: 'Diagnostics', href: LINKS.diagnostics },
      { label: 'Regression', href: LINKS.regression },
      { label: 'Snapshots', href: LINKS.snapshots },
    ],
  },
  {
    label: 'Docs',
    links: [
      { label: 'Quickstart', href: LINKS.quickstart },
      { label: 'CLI', href: LINKS.cli },
      { label: 'Privacy', href: LINKS.privacy },
      { label: 'Limitations', href: LINKS.limitations },
    ],
  },
  {
    label: 'Project',
    links: [
      { label: 'GitHub', href: LINKS.github },
      { label: 'npm', href: LINKS.npm },
      { label: 'Changelog', href: LINKS.changelog },
      { label: 'License', href: LINKS.license },
    ],
  },
] as const
