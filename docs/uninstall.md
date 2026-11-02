# Uninstall and cleanup

`stacknext uninstall` removes only files that StackNext generated. It does not
delete user-authored instrumentation, application data, saved regression records
or packages unless you ask for it.

## Stop the running process first

Stop `stacknext dev` with SIGINT or SIGTERM and wait for the process to exit.
The CLI removes `.stacknext/run.json` and stops the collector during shutdown.
Uninstall refuses to remove runtime files when the recorded process is still
alive.

On Windows, closing the terminal may not stop the child Next.js process. Check
for an orphaned `node.exe`/`next` process before retrying, then send
`Ctrl+C` to the StackNext process rather than the child.

## Preview the removals

```bash
npx stacknext uninstall
```

The default is a dry run. It prints:

- generated `instrumentation.ts`/`instrumentation.js` that still matches the
  StackNext template;
- `stacknext.config.json`;
- `.stacknext/run.json`;
- optional `.stacknext` capture data when `--remove-data` is passed;
- the package-manager command that would remove StackNext packages;
- anything preserved because it belongs to the application.

No file is changed until `--yes` is passed.

## Apply the safe cleanup

```bash
npx stacknext uninstall --yes
```

This removes only StackNext-owned files and leaves these alone:

- an `instrumentation` file you edited or wrote yourself, even if it imports
  `@stacknext/next`;
- application code, `next.config.*`, middleware, proxy, layout and route files;
- `node_modules`, lockfiles and package.json;
- `.stacknext/runs`, `.stacknext/baselines` and `.stacknext/comparisons`;
- the example app's SQLite database or any other application data.

If user instrumentation imports StackNext, the command prints the manual edit
required. It does not rewrite your file.

## Options

| Option | Effect |
| --- | --- |
| `--yes` | Apply the planned removals. Without it the command is a dry run. |
| `--keep-config` | Preserve `stacknext.config.json`. |
| `--remove-data` | Also remove saved runs, baselines and comparisons under `.stacknext`. Requires `--yes` to apply. |
| `--json` | Print a machine-readable plan or result. |

Example: remove generated files and saved regression data, but keep the config:

```bash
npx stacknext uninstall --yes --keep-config --remove-data
```

## Remove the packages

After the file cleanup, remove the packages with the package manager shown by
the command. For npm:

```bash
npm uninstall stacknext @stacknext/next @stacknext/drizzle @stacknext/prisma @stacknext/playwright
```

For pnpm:

```bash
pnpm remove stacknext @stacknext/next @stacknext/drizzle @stacknext/prisma @stacknext/playwright
```

Remove only the optional adapters that are installed. The other `@stacknext/*`
packages are dependencies of the CLI and disappear when `stacknext` is removed.

## Manual cleanup

If the CLI is no longer available:

1. Delete `stacknext.config.json` if StackNext created it.
2. Delete `instrumentation.ts` or `instrumentation.js` only when it exactly
   matches the generated StackNext template. If you edited it, remove the
   StackNext import and hook manually.
3. Delete `.stacknext/run.json`. Keep `.stacknext/runs`, `.stacknext/baselines`
   and `.stacknext/comparisons` if you still need the evidence.
4. Delete the `.stacknext` directory only when you no longer need any saved
   records.
5. Remove the packages with the package manager.
6. Remove StackNext from any MCP client configuration and remove the
   `stacknext-debugging` skill from your agent's skill directory if you installed
   it. The skill is not removed automatically because it lives outside the app.

## CI and captured artifacts

Uninstalling the local tool does not affect CI artifacts or files you copied
outside the app. Delete uploaded runs, baselines and comparisons according to
your CI provider's retention policy. Never commit `.stacknext/run.json` or a
collector bearer token.

## Verify the cleanup

```bash
npx stacknext doctor
```

After package removal, `npx` will offer to install the CLI again; that is
expected. Confirm the app starts with its normal `dev` script and that no
`stacknext` process remains on the collector ports (4400–4425 by default).
