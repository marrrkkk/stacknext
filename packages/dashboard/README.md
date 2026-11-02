# @stacknext/dashboard

Static React dashboard served by the [StackNext](https://github.com/marrrkkk/stacknext)
local collector.

This package is a runtime dependency of the `@stacknext/cli` CLI. Applications
should install the CLI rather than use this package directly:

```bash
npm install --save-dev @stacknext/cli @stacknext/next
npx stacknext dev
```

The dashboard is in-memory, loopback-only and receives already-redacted
telemetry from the collector. It is not a hosted service.

License: MIT.
