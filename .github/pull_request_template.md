<!--
PR title: use a Conventional Commit, for example `feat(cli): add snapshot export`.
main is squash-merged and the release planner reads this title.
-->

## Summary

Describe the user-visible problem and the change. Link the issue when one
exists.

## Type

- [ ] PR title follows Conventional Commits
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Packaging or release tooling
- [ ] Refactor with no behavior change
- [ ] Security hardening

## Verification

List the exact commands and results. Do not write "tests pass" without naming
the suite.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:docs
```

- [ ] `pnpm test:e2e` (when runtime, dashboard, CLI, MCP or regression behavior changed)
- [ ] `pnpm test:packages` (when package metadata, exports or build output changed)
- [ ] `pnpm test:consumer --next 15.5.28 --pm npm --skip-build` and/or `--next 16.4.3`

## Compatibility

- [ ] Next.js 15 and 16 were considered.
- [ ] Node.js 22/24 behavior was considered.
- [ ] Existing `instrumentation.ts`, middleware, proxy and `next.config` remain untouched.
- [ ] The change is ESM-compatible and does not add a CommonJS-only dependency.

## Privacy and security

- [ ] No token, secret, customer data or unredacted captured record is included.
- [ ] New captured fields are redacted in the app and in the collector.
- [ ] API/export/regression/MCP output has a test proving secrets do not appear.
- [ ] The collector remains loopback-only and MCP tools remain read-only.
- [ ] `pnpm audit --prod` was reviewed when dependencies changed.

## Documentation and release notes

- [ ] Public docs under `apps/docs/` and/or engineering docs under `docs/` are updated.
- [ ] `CHANGELOG.md` has an entry for user-visible changes.
- [ ] Screenshots were regenerated from the real StackNext app when the UI changed.
- [ ] No generated `dist`, `.next`, `.stacknext`, `release` or test output is committed.

## Notes for reviewers

Call out migrations, follow-up work, known gaps or checks that could not run.
