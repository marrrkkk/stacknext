export type DemoCategory = 'requests' | 'database' | 'errors' | 'spans'

export interface DemoRoute {
  id: string
  title: string
  method: 'GET'
  path: string
  category: DemoCategory
  /** What the route does when it runs. */
  description: string
  /** The StackNext view or finding this route is meant to exercise. */
  evidence: string
  /** Dashboard path override when the category default is not the best evidence. */
  inspectPath?: string
  /** Label for the inspect link; defaults to the category label. */
  inspectLabel?: string
  /** Safe to run as part of the one-click traffic sample. */
  inTrafficRun: boolean
}

export interface DemoGroup {
  id: DemoCategory
  label: string
  description: string
  routes: DemoRoute[]
}

export const DEMO_GROUPS: DemoGroup[] = [
  {
    id: 'requests',
    label: 'Requests and traces',
    description: 'Request spans, timing, custom spans and repeated downstream calls.',
    routes: [
      {
        id: 'projects',
        title: 'Read the project API',
        method: 'GET',
        path: '/api/projects',
        category: 'requests',
        description: 'One Drizzle aggregate query behind a JSON route handler.',
        evidence: 'Traces → the request span, its child span and the SQL query.',
        inTrafficRun: true,
      },
      {
        id: 'slow',
        title: 'Slow request',
        method: 'GET',
        path: '/api/slow?delay=350',
        category: 'requests',
        description: 'Waits 350 ms, deliberately above the 250 ms slow-request threshold.',
        evidence: 'Overview latency chart and the slow-request KPI in Traces.',
        inTrafficRun: true,
      },
      {
        id: 'custom-work',
        title: 'Manual spans',
        method: 'GET',
        path: '/api/custom-work',
        category: 'requests',
        description: 'Nests sync and async helpers with withStackNextSpan().',
        evidence: 'Trace timeline: demo.custom.async → demo.custom.sync.',
        inTrafficRun: true,
      },
      {
        id: 'repeated-fetch',
        title: 'Repeated fetch',
        method: 'GET',
        path: '/api/repeated-fetch',
        category: 'requests',
        description: 'Calls /api/projects three times with cache: no-store.',
        evidence: 'Repeated outbound HTTP spans and the repeated-fetch finding.',
        inTrafficRun: true,
      },
    ],
  },
  {
    id: 'database',
    label: 'Database',
    description: 'Query shapes, N+1 access patterns and slow database work.',
    routes: [
      {
        id: 'n-plus-one',
        title: 'N+1 queries',
        method: 'GET',
        path: '/api/n-plus-one',
        category: 'database',
        description: 'Runs one task query per project, eight times over the same three ids.',
        evidence: 'Database → repeated query shape and the N+1 diagnostic.',
        inTrafficRun: true,
      },
      {
        id: 'n-plus-one-fixed',
        title: 'Batched queries',
        method: 'GET',
        path: '/api/n-plus-one-fixed',
        category: 'database',
        description: 'The same data in one inArray query. Compare it with the N+1 route.',
        evidence: 'Database → one query for all projects instead of eight.',
        inTrafficRun: true,
      },
      {
        id: 'slow-db',
        title: 'Slow database span',
        method: 'GET',
        path: '/api/slow-db',
        category: 'database',
        description: 'Runs a CPU-bound recursive CTE inside a manual database span.',
        evidence: 'Database → slow query evidence with documented db.* attributes.',
        inTrafficRun: true,
      },
    ],
  },
  {
    id: 'errors',
    label: 'Errors and redaction',
    description: 'A real failure with secrets in the message and URL that must never appear.',
    routes: [
      {
        id: 'error',
        title: 'Throwing route',
        method: 'GET',
        path: '/api/error?token=demo-url-secret',
        category: 'errors',
        description: 'Throws after a query. The token, URL query value and password are redacted.',
        evidence: 'Errors → redacted message, trace correlation and the failing span.',
        inTrafficRun: true,
      },
      {
        id: 'not-found',
        title: 'Missing project',
        method: 'GET',
        path: '/projects/999',
        category: 'errors',
        description: 'A rendered 404 for a project that does not exist.',
        evidence: 'Traces → a request that ends in a client error, not a server error.',
        inspectPath: '/traces',
        inspectLabel: 'Open traces',
        inTrafficRun: false,
      },
    ],
  },
  {
    id: 'spans',
    label: 'Server Actions and manual spans',
    description: 'Successful, failed and control-flow actions plus the custom span helpers.',
    routes: [
      {
        id: 'action-success',
        title: 'Successful action',
        method: 'GET',
        path: '/api/actions-demo?case=success',
        category: 'spans',
        description: 'Wraps a successful Server Action and returns its normalized result.',
        evidence: 'Traces → action/create-task and its nested normalize span.',
        inTrafficRun: true,
      },
      {
        id: 'action-failure',
        title: 'Failing action',
        method: 'GET',
        path: '/api/actions-demo?case=failure',
        category: 'spans',
        description: 'Throws from inside a wrapped action with a secret in the message.',
        evidence: 'Errors → a redacted action failure in the same trace as the request.',
        inspectPath: '/errors',
        inspectLabel: 'Open errors',
        inTrafficRun: true,
      },
      {
        id: 'action-redirect',
        title: 'Control flow',
        method: 'GET',
        path: '/api/actions-demo?case=redirect',
        category: 'spans',
        description: 'redirect() and notFound() are control flow, not failures.',
        evidence: 'Traces → action spans that finish without an error span.',
        inTrafficRun: false,
      },
      {
        id: 'action-concurrent',
        title: 'Concurrent actions',
        method: 'GET',
        path: '/api/actions-demo?case=concurrent',
        category: 'spans',
        description: 'Runs three wrapped actions concurrently.',
        evidence: 'Traces → sibling action spans with independent durations.',
        inTrafficRun: false,
      },
    ],
  },
]

export const TRAFFIC_ROUTES: DemoRoute[] = DEMO_GROUPS.flatMap((group) =>
  group.routes.filter((route) => route.inTrafficRun),
)
