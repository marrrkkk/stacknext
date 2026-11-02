# @stacknext/regression

Versioned capture-run, baseline and comparison schemas plus deterministic
comparison logic for [StackNext](https://github.com/marrrkkk/stacknext).

Playwright-linked samples are compared using medians and explicit thresholds.
Statuses are `improved`, `regressed`, `unchanged` or `inconclusive`; comparisons
are not statistical tests and do not prove causality. Records are redacted
local JSON files under `.stacknext`.

```bash
npm install --save-dev stacknext @stacknext/next @stacknext/playwright
npx stacknext capture --name baseline -- npx playwright test --workers=1
```

This package is ESM-only and requires Node.js 20.9 or newer.

License: MIT.
