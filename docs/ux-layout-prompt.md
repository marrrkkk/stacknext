---
title: Dashboard layout specification
description: The dashboard shell, navigation, page headers and interaction criteria.
---

# Prompt: dashboard layout and navigation

Use this prompt to reproduce or review the StackNext dashboard shell redesign.
It is scoped to layout, navigation, page headers and interaction quality. It
does not change telemetry collection, diagnostics, regression comparison,
privacy boundaries or the read-only MCP surface.

## Role

You are a senior product designer and front-end engineer working in the
StackNext repository. Improve the dashboard so it feels calm, fast and
obvious to navigate, in the spirit of a calm, focused desktop app, while keeping the
existing StackNext content and data behaviour intact.

## Design principles

Use these working principles:

1. **Content first.** Chrome recedes. The page title, primary data and actions
   should be the first things the eye lands on.
2. **Less visual noise.** Prefer typography, spacing and a few quiet surfaces
   over nested cards, heavy borders and competing accent colours.
3. **A stable shell.** The sidebar and topbar stay predictable while the
   content column changes. Navigation should never jump when a route changes.
4. **Dense but calm.** Keep the compact telemetry density, but give headings,
   section boundaries and empty states enough room to breathe.
5. **Shortcuts are first-class.** Navigation, search and layout controls are
   reachable from the keyboard and discoverable in the UI.
6. **One component language.** Page headers, badges, buttons, cards, empty
   states and settings rows look and behave the same on every route.
7. **Progressive disclosure.** Group navigation by intent instead of exposing
   a long undifferentiated list. Reveal detail in context, not as decoration.

## Repository context

- Dashboard stack: React 19, Vite 7, TypeScript strict, plain CSS with BEM
  class names, self-hosted Inter.
- Entry points: `packages/dashboard/src/App.tsx`,
  `packages/dashboard/src/components/ui.tsx`,
  `packages/dashboard/src/styles.css`.
- Keep routing, API calls, SSE refresh, redaction and existing page content
  unchanged.
- Do not add a UI framework, icon package, CSS-in-JS runtime or state library.
- Preserve the current theme cycle: **dark → light → system**.
- Every new interactive control needs a visible focus state, an accessible
  name and keyboard support.
- Respect `prefers-reduced-motion`.
- Do not put tokens, raw telemetry or local paths into the UI, screenshots or
  docs.

## Deliverables

### 1. Sidebar and navigation

- Group primary navigation by intent:
  - **Observe**: Overview, Traces (with an HTTP-request view), Database
  - **Investigate**: Errors, Diagnostics
  - **Test**: Test runs, Baselines, Comparisons
  - **Configure**: MCP & settings
- Keep every route directly reachable; do not hide Test runs, Baselines or
  Comparisons behind a nested disclosure.
- Show the existing error count badge on Errors. In the collapsed rail it
  becomes a small dot, not a squashed number.
- Sidebar width: `244px` expanded, `64px` collapsed. Animate width and
  flex-basis with the existing duration/easing tokens.
- Desktop collapse control in the sidebar brand row. When the rail is
  collapsed, the logo is replaced by the expand control. Persist the preference
  in `localStorage` under `stacknext-sidebar-collapsed`.
- Keep one mobile-only topbar navigation trigger that opens and closes the
  drawer; its label and `aria-expanded` must reflect the current state.
- `Cmd/Ctrl+B` toggles the sidebar globally.
- Mobile drawer:
  - fixed, 272px, slides in over a scrim;
  - close button, scrim click and `Escape` all close it;
  - focus moves into the drawer when it opens and returns to the trigger when
    it closes;
  - the main region is `inert` while the drawer is open.
- Include a skip link to `#main-content`.
- Keep the live SSE status, collector connection, version, theme control and
  source link in the sidebar footer, but let them collapse cleanly on the rail.

### 2. Topbar and breadcrumbs

- Height stays `40px`; the topbar is chrome, not a second page header.
- Left to right: project name, breadcrumb trail, command/search trigger,
  connection status and dashboard URL. On mobile the navigation trigger comes
  first.
- Breadcrumbs show the project and the current route title. On detail pages the
  trail shows the back action and the record id only.
- Do **not** portal page actions (refresh, export, copy, new capture) into the
  topbar. Actions belong with the page header.
- Below `1100px` hide the dashboard URL; below `900px` hide the project name;
  below `640px` collapse the command trigger to an icon and hide the status
  area.

### 3. Page headers

Create one shared `PageHeader` contract used by every page:

- List pages: title, optional description and optional actions.
- Detail pages: title, badges/aside content, metadata line, optional back trail
  and optional actions.
- The header sits at the top of the content column, not in the topbar.
- Title: `20px/28px` for list pages, `24px/32px/20px` for detail pages before
  the mobile breakpoint; tighten to `20px/28px` below `640px`.
- Description: secondary text, max width `720px`.
- Actions: right aligned on desktop, wrap below the title on narrow screens.
- Remove the old page-intro portal/slot pattern and any page actions that were
  rendered into the topbar.

### 4. Command menu

Add a command menu:

- Opens with `Cmd/Ctrl+K` or the topbar search trigger; closes with `Escape`,
  the close button or a click on the overlay.
- Search filters groups by label, hint, keywords and group name.
- Group results into **Go to**, **Explore** and **Actions**.
- Go to: every primary route.
- Explore: filtered request views (slow, 5xx, 4xx, slowest).
- Actions: collapse/expand sidebar, cycle theme, copy current URL, open docs.
- Arrow keys move the active row, `Enter` runs it, `Home`/`End` jump to the
  edges. Show the active descendant with `aria-activedescendant`.
- Render in a portal, trap focus in the dialog while open, restore focus to the
  previously focused element on close, and lock background scrolling visually
  with the overlay.
- Never mutate telemetry from the command menu. Copying a URL and opening docs
  are the only browser-side side effects.
- Show an empty state with suggested searches when nothing matches.
- Mobile: full-width dialog with the overlay padding reduced and keyboard hint
  footer hidden.

### 5. Component and CSS consistency

- Reuse the existing tokens for spacing, type, radii, colours, focus rings and
  motion. Avoid one-off hex colours in components.
- Add a shared `.kbd` style for shortcuts. Use it in the topbar, command menu
  and Settings.
- Keep cards quiet: one border, one surface, no nested card-on-card chrome.
- Keep button variants (`primary`, `secondary`, `ghost`, `icon`, `small`,
  `compact`) consistent across pages.
- Settings gets a **Navigation** section that exposes the sidebar preference,
  command-menu shortcut, sidebar shortcut and theme cycle.
- Delete obsolete shell CSS for `.page-intro*`, `.topbar__actions` and
  `.topbar__menu`.

### 6. Responsive and accessibility acceptance

- No horizontal scrolling at `1280`, `1024`, `900`, `768`, `640`, `480` or
  `375px` viewport widths.
- Sidebar rail styles apply only at `min-width: 901px`; mobile always uses the
  drawer.
- Collapsed item labels are hidden visually but remain available as `title`
  text and accessible names.
- List tables below `640px` keep only primary columns; detail tables scroll
  horizontally instead of compressing every column.
- Stat strips use a compact two-column grid below `900px`, and hints wrap
  rather than truncating mid-sentence.
- Global `Cmd/Ctrl` shortcuts do not fire while a text field is focused.
  `Cmd/Ctrl+B` is ignored while the command menu is open, and `Cmd/Ctrl+K`
  closes the mobile drawer before opening the menu.
- All icon-only buttons have `aria-label`; all nav items expose
  `aria-current="page"` when active.
- Focus is always visible against both themes.
- The command input uses `role="combobox"`, the result list uses
  `role="listbox"` and options use `role="option"` with `aria-selected`.
- Reduced motion removes the sidebar/overlay transitions without breaking
  layout.
- Both dark and light themes keep at least WCAG AA contrast for body text and
  controls.

## Non-goals

- No new dashboard data, diagnostics rules, regression behaviour or MCP tools.
- No server-side rendering, router dependency or global state library.
- No remote fonts, analytics, telemetry or network calls.
- No custom drag-and-drop layout editor.
- No attempt to copy another product's brand, logo or exact visual assets.

## Likely files

- `packages/dashboard/src/App.tsx`
- `packages/dashboard/src/components/ui.tsx`
- `packages/dashboard/src/components/CommandPalette.tsx` (new)
- `packages/dashboard/src/components/Icon.tsx`
- `packages/dashboard/src/pages/SettingsPage.tsx`
- `packages/dashboard/src/styles.css`
- `docs/screenshots/` (refresh affected captures)
- `CHANGELOG.md`

## Verification

Run from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Then manually verify:

1. `Cmd/Ctrl+B` collapses and expands the desktop sidebar; the state survives a
   reload.
2. The sidebar collapse control collapses the desktop rail and is replaced by
   an expand control in the collapsed rail. On mobile the topbar trigger opens
   the drawer.
3. The drawer closes by scrim, close button and `Escape`, and focus returns to
   the trigger.
4. `Cmd/Ctrl+K` opens the command menu; arrows, `Enter`, `Home`, `End` and
   `Escape` behave; focus returns after closing.
5. Every grouped nav item routes correctly and marks itself active.
6. Page titles, descriptions and actions render in the content header on list
   and detail pages.
7. Both themes and the system theme render correctly at all breakpoints.
8. No page shows a horizontal scrollbar and no console errors appear.
9. Existing privacy checks still pass: no tokens, raw headers, query values or
   SQL bind parameters appear in the UI, exports or screenshots.
10. At `390px`, list tables show only their primary columns, stat strips form a
    compact two-column grid, and coverage, diagnostics and regression scenario
    rows wrap without clipping.
11. Focus a search field and press `Cmd/Ctrl+B`: the sidebar must not move.
    Open the command menu and press `Cmd/Ctrl+B`: the sidebar must stay put.

## Definition of done

- The shell, page headers, command menu and Settings navigation are implemented
  on every route.
- The old topbar action/intro plumbing is gone.
- Lint, typecheck, unit tests, build and e2e pass.
- Updated screenshots and changelog entry are included.
- A reviewer can use the dashboard with only a keyboard, in either theme, at
  desktop and mobile widths.
