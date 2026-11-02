# @stacknext/core

Core wire types, Zod schemas, redaction, configuration, framework span metadata,
bounded in-memory storage and async transport for [StackNext](https://github.com/marrrkkk/stacknext).

This package is the shared foundation for the StackNext CLI, adapters and app
instrumentation. Most applications should install `@stacknext/cli` and
`@stacknext/next` instead of depending on this package directly.

```bash
npm install --save-dev @stacknext/cli @stacknext/next
npx stacknext init
npx stacknext dev
```

The package is ESM-only, requires Node.js 20.9 or newer and does not perform
network I/O unless a loopback collector URL and token are supplied.

License: MIT.
