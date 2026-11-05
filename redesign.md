# Redesign prompt: StackNext dashboard design

Nov 3, 2026 · @Mark

## Goal

Restyle the entire StackNext dashboard (`packages/dashboard`, React + Vite) so every screen follows one calm, focused desktop pattern: a consistent color system, typography, sizes, spacing, components, layout and motion. This is a presentation-only change. Content, data, routes and behavior stay exactly as they are.

Use a focused desktop redesign as the model: less visual noise, strict alignment, and more hierarchy and density in the chrome (sidebar, headers, tabs, panels) around calm, neutral content. Deliver it in dark and light themes, as one consistent system across every page and every state.

Reference screenshots, if attached to this task, outrank any value written below.

## Hard rules

Change how the dashboard looks and feels, never what it says or does.

**Frozen**

- Every visible string, number, data field, route, query parameter and API call. Text can move to where the reference design puts it (a page title into the header bar, say) but is never reworded, removed or added.
- Data flow and logic in `api.ts`, `hooks.ts`, `format.ts` and `router.ts`, plus component props. Edit only presentation: `src/styles.css`, `components/*`, JSX structure and class names in `pages/*` and `App.tsx`.
- StackNext's name, logo mark and favicon. Do not use another product's logo, wordmark, icons or any other asset, and do not copy another product's code. Copy the design language, not the brand.
- The theme mechanism: `data-theme` on `<html>` with dark, light and system, driven by `useTheme`. Both themes ship finished.
- The privacy and security rules in `AGENTS.md`. The collector's CSP is `default-src 'self'` with `font-src 'self'`, so no CDN fonts, remote images or external requests of any kind.

**Dependencies**

- Plain CSS with custom properties, as today. No Tailwind, no component library, no CSS-in-JS.
- The one allowed addition is a self-hosted Inter variable font, through `@fontsource-variable/inter` or a `woff2` file in `public/`.

**Must change**

- Everything visual: color, type, sizes, spacing, radii, borders, shadows, icons, chrome layout, every component and every state, motion.
- Remove what the reference design does not have: the background grid (`body::before`), sidebar blur, the gradient logo tile, tinted icon tiles, accent-outlined active nav items, uppercase eyebrow labels, the 14 and 20 px radii and heavy shadows.

## Step 0: audit first, then plan

Map what exists before changing a line, then write a one-page plan and carry on.

**What is there today**

- `packages/dashboard`: React 19 and Vite 7, 17 routes served by 16 page components, one stylesheet (`src/styles.css`, about 3,000 lines of BEM-style classes), inline-SVG icons in `components/Icon.tsx`, shared primitives in `components/ui.tsx` and the span waterfall in `components/Timeline.tsx`.
- Tokens exist but do not form a system: about 20 font sizes from 8.5 to 64 px (most text sits at 10.5 to 12.5 px), a dozen or more radius values, 10 shadow declarations, 8 gradients, 5 inline `style` objects, and two hex values in the logo SVG in `App.tsx`.
- The chosen theme persists in `localStorage` under `stacknext-theme`. Keep that key.

**Do this**

1. Read `AGENTS.md`, the dashboard README, `styles.css` and every file under `src/components` and `src/pages`.
2. Seed real data for every view by following the verification workflow in `AGENTS.md`: the demo routes, then a capture, baseline and compare run so Testing has records. Take "before" screenshots of all 17 routes in dark and light at 1440 × 900 and at 390 px wide, and keep them outside the repo.
3. List every class in `styles.css`, every inline style and every hardcoded value. Map each one to the token or shared component that will replace it, and flag one-offs.
4. Write the plan: token file layout, component list, order of work. Then start. Ask only if the plan collides with a hard rule.

## Step 1: design tokens

Build one token layer first; every later rule reads from it and from nothing else.

Put it at the top of `styles.css`, or in a `tokens.css` imported by `main.tsx`. The values are reference values for the current look. If reference screenshots are attached, sample from them and adjust the numbers, but keep this structure.

```css
:root {
  --font-sans: 'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;

  --fs-micro: 11px;   --fs-small: 12px;   --fs-base: 13px;
  --fs-large: 15px;   --fs-title-3: 20px; --fs-title-2: 24px;
  --fw-normal: 400;   --fw-medium: 510;   --fw-semibold: 590;

  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px;  --sp-4: 16px;  --sp-5: 20px;  --sp-6: 24px;  --sp-8: 32px;
  --radius-xs: 4px;  --radius-sm: 6px;  --radius-md: 8px;  --radius-lg: 12px;  --radius-full: 9999px;

  --sidebar-w: 244px;  --header-h: 40px;
  --dur-fast: 100ms;  --dur: 150ms;  --ease: cubic-bezier(0.25, 0.46, 0.45, 0.94);

  /* status palette, identical in both themes */
  --red: #eb5757;   --orange: #f2994a;  --yellow: #f2c94c;  --green: #4cb782;
  --cyan: #26b5ce;  --blue: #4ea7fc;    --purple: #bb87fc;  --gray: #95a2b3;
}

[data-theme='dark'] {
  color-scheme: dark;
  --bg-frame: #08090a;     /* sidebar and recessed chrome */
  --bg-content: #0f1011;   /* main panel */
  --bg-raised: #141516;    /* cards, table header */
  --bg-overlay: #191a1b;   /* menus, popovers, dialogs */
  --bg-hover: rgb(255 255 255 / 0.05);
  --bg-selected: rgb(255 255 255 / 0.08);
  --border: rgb(255 255 255 / 0.08);
  --border-subtle: rgb(255 255 255 / 0.05);
  --border-strong: rgb(255 255 255 / 0.14);
  --text-primary: #f7f8f8;   --text-secondary: #d0d6e0;
  --text-tertiary: #8a8f98;  --text-quaternary: #62666d;
  --accent: #7170ff;  --accent-fill: #5e6ad2;  --accent-bg: rgb(113 112 255 / 0.14);
  --shadow-menu: 0 8px 24px rgb(0 0 0 / 0.4);
}

[data-theme='light'] {
  color-scheme: light;
  --bg-frame: #f4f5f7;
  --bg-content: #ffffff;
  --bg-raised: #fafafb;
  --bg-overlay: #ffffff;
  --bg-hover: rgb(0 0 0 / 0.04);
  --bg-selected: rgb(0 0 0 / 0.06);
  --border: rgb(0 0 0 / 0.08);
  --border-subtle: rgb(0 0 0 / 0.05);
  --border-strong: rgb(0 0 0 / 0.14);
  --text-primary: #1b1c1e;   --text-secondary: #3d4046;
  --text-tertiary: #6b6d73;  --text-quaternary: #9a9ca2;
  --accent: #5e6ad2;  --accent-fill: #5e6ad2;  --accent-bg: rgb(94 106 210 / 0.1);
  --shadow-menu: 0 8px 24px rgb(0 0 0 / 0.12);
}
```

**Fonts**

- Self-host Inter Variable (see Hard rules). Use `font-display: swap`. Weights 510 and 590 render only with the variable font.
- Base text is 13 px on a 20 px line, weight 400. Nav items, buttons, labels and row titles use 510. Headings and selected titles use 590.
- Allowed sizes are the six `--fs-*` tokens, on line heights of 16, 16, 20, 24, 28 and 32 px. Nothing between them: no 10.5, 11.5, 12.5, 13.5 or 14 px.
- Letter spacing is 0 up to 13 px, -0.01em at 15 px and -0.02em from 20 px. Use Inter Display for text of 20 px and up where the font package offers it.
- No uppercase or letter-spaced labels anywhere (eyebrows, table headers, stat labels). Sentence case, 12 px, `--text-tertiary`.
- Durations, counts, timestamps and ids use `font-variant-numeric: tabular-nums`. Mono is for SQL, ids, URLs and JSON only, at 12 px.

**Space, shape, elevation**

- Everything sits on the 4 px grid; 2 and 6 px are allowed for optical alignment. No other padding, margin or gap values.
- Radii: 4 px chips and keys, 6 px buttons, inputs, nav and tab items, 8 px panels and menus, 12 px dialogs, full for dots and pills. Delete every other radius.
- Borders are 1 px hairlines in `--border`. Separate surfaces by lightness step and hairline, not shadow. Only menus, popovers and dialogs get a shadow.
- Layer order, lowest to highest: frame, content, raised, overlay. Hover and selected are alpha overlays (`--bg-hover`, `--bg-selected`) on whatever surface they sit on.
- Focus ring on `:focus-visible` only: 2 px outline in `--accent` at about 70% opacity, 1 px offset. Never remove outlines without a replacement.

**Color use**

- Neutral first. Text, icons, borders and fills come from the neutral ladder. Color appears only where it carries meaning: a status dot, a bar, an icon, a one-line banner tint.
- Keep the neutrals nearly untinted. The neutral ladder should carry very little blue so the theme reads neutral and timeless.
- Text and neutral icons are darker in light theme and lighter in dark theme than they are today. Every text token must reach 4.5:1 on every surface it sits on, except `--text-quaternary`, which is for disabled and decorative use only.
- Mapping: error, failed and 5xx are red. Warning, slow, not-observed and 4xx are orange. Unknown is yellow. Success, observed, connected, live and instrumented are green. Unsupported and muted are gray. Informational and framework spans are blue.
- Span categories keep today's hue families, snapped to this palette: framework blue, app and custom orange, database green, fetch purple, error red.
- In light theme a semantic color used as text must be darkened to reach 4.5:1, for example `color-mix(in oklch, var(--red) 70%, black)`. Dots, icons and bars use the base value.
- Preferred refinement: derive the neutral ladder and accent steps in OKLCH from three inputs (base, accent, contrast), deriving them from three inputs rather than hand-setting 98 variables per theme. Keep results within two lightness points of the values above.

**Motion and icons**

- Transition only `background-color`, `color`, `border-color` and `opacity`, over 100 to 150 ms with `--ease`. Menus and dialogs fade in with a 2 px rise. No springs, no bounce, no layout shift. Keep the existing `prefers-reduced-motion` rule.
- One icon set, the existing `Icon.tsx` glyphs redrawn to match if needed: 16 px box, about 1.5 px on-screen stroke, round caps and joins, `currentColor`. Use 14 px beside 12 px text. Default color `--text-tertiary`, `--text-primary` on hover or when active. No filled or tinted tiles behind icons.

## Step 2: app shell

Rebuild the shell as an inverted L: a recessed sidebar and header bar framing one calm content panel.

**Frame**

- Sidebar: `--sidebar-w` (244 px), full height, `--bg-frame`, no backdrop blur, no gradient, no border of its own.
- Content panel: `--bg-content` with a 1 px `--border` hairline and `--radius-md`. It sits 8 px in from the window's top, right and bottom edges and flush against the sidebar. Below 900 px it goes full-bleed with no radius.
- The header bar is the first 40 px of the panel, with a bottom hairline. The sidebar has the same 8 px top inset and its first row is also 40 px, so the logo row and the header text share one baseline.
- The page body scrolls inside the panel while the sidebar and header stay fixed. Page padding is 24 px. List pages run edge to edge with 16 px row padding. Settings, 404 and other text-heavy pages cap the column at 720 px.

**Header bar** (replaces `.topbar` and takes over the title row of `PageHeader`)

- Left: a breadcrumb. First the project name (today's `topbar__project`), then the page's eyebrow if it differs from the project name, then the page title. Earlier segments use `--text-tertiary`, the last uses `--text-primary` at 13 px/510, separated by a 14 px chevron.
- Right: the page's action buttons with their existing icons and labels (28 px, secondary or ghost), then the `instrumented` status chip, then the dashboard URL in 12 px mono `--text-tertiary`.
- Keep `PageHeader`'s props. Render its title, eyebrow and actions into the header bar through a small slot or portal, so pages keep their data flow. The description becomes a 12 px `--text-tertiary` intro line at the top of the page body. It wraps and is never truncated.
- Detail pages (request, trace, error, diagnostic, run, baseline, comparison) differ in one way, as in a focused detail view. The header holds the back breadcrumb (today's `.breadcrumb`) plus the Copy id and Refresh buttons. The title moves into the body as a 24 px/590 heading with its method and status chips inline, and the meta line sits below it at 13 px `--text-tertiary`.
- The eyebrow is never an uppercase blue label. It becomes a breadcrumb segment on list pages and the first item of the meta line on detail pages.

**Sidebar**

- First row: the existing logo mark at 20 px without a tile (keep its gradient), "StackNext" at 13 px/590 and the project name at 12 px `--text-tertiary` beneath it, inside one 40 px row.
- Nav items: 28 px high, 8 px side padding, 8 px icon-to-label gap, 2 px between items, `--radius-sm`. The 16 px icon is `--text-tertiary` and the 13 px/510 label is `--text-secondary`. Hover is `--bg-hover`. Active is `--bg-selected` with `--text-primary` on label and icon. No accent color and no border.
- Errors count: right-aligned pill, 16 px high, 12 px tabular numerals, red at 16% fill with darkened red text. It is the only colored element in the sidebar.
- Bottom group: the Live and connection cards lose their borders and fills and become plain rows under a hairline. Dot, label and relative time share one 28 px row, and the hint and connection meta wrap beneath in 12 px `--text-tertiary`. The version sits left in 12 px mono, and the theme and GitHub buttons sit right as 24 px ghost icon buttons.
- Status dots are 8 px solid circles in the status palette. Drop the halo animation.

**Responsive**

- Keep today's breakpoints and drawer behavior (scrim, menu button, close button) and restyle only. The drawer uses the frame surface and `--shadow-menu`, and the panel goes full-bleed.
- The content footer ("StackNext is local-only…" and the counts) becomes a 12 px `--text-tertiary` row at the bottom of the page body, above a hairline.

## Step 3: component specs

Replace today's bespoke styles with one set of primitives, each built once in `components/ui.tsx` (or a file beside it) and reused everywhere. Every class found in the audit maps to one of these.

**Buttons**

- Three variants. Primary: `--accent-fill` with a white label, at most one per view. Secondary: 1 px `--border`, `--bg-raised` fill, `--text-primary` label. Ghost: no border or fill, `--text-secondary` label.
- Page-level actions such as Refresh and Copy id use secondary. In-row and icon-only actions use ghost.
- Sizes: 28 px default, 24 px small, 32 px in forms only. Label 13 px/510 (12 px on small), `--radius-sm`, 10 px side padding, 6 px icon gap, 16 px icon. Icon buttons are square.
- States: hover adds `--bg-hover` (secondary also `--border-strong`), pressed darkens slightly, `:focus-visible` shows the ring, disabled drops to `--text-quaternary` with no hover. No gradients and no shadows.

**Inputs**

- Search and select share one chrome: 28 px high, 1 px `--border`, transparent fill, `--radius-sm`, 13 px text, `--text-tertiary` placeholder and icon. Hover uses `--border-strong`. Focus uses an `--accent` border plus the ring.
- Select keeps the native control with a 14 px custom chevron. Use a custom listbox only if keyboard and screen-reader behavior stay intact.
- Toggle: 28 × 16 px track, 12 px thumb, off `--bg-selected`, on `--accent-fill`, 13 px label.

**Chips and badges**

- One chip: 20 px high, 6 px side padding, 12 px/510 `--text-secondary` label, 1 px `--border`, transparent fill, `--radius-full`, optional 6 px colored dot. Tones set the dot only: good green, warn orange, bad red, muted gray, accent `--accent`. The text stays neutral.
- Use it for badges, coverage statuses, severities, HTTP status codes and the `instrumented` status. Method labels (GET, POST and so on) are 11 px/510 mono text in a `--radius-xs` chip with the same border and no color fill.
- Tinted fills belong to banners only. Counts in tabs and section titles are plain 12 px `--text-tertiary` numerals, not pills.

**Cards and stat tiles**

- Card: `--bg-raised`, 1 px `--border`, `--radius-md`, no shadow. Header 40 px: title 13 px/590, subtitle 12 px `--text-tertiary`, actions on the right. Body padding is 16 px, or flush when it holds a list or table, with a hairline under the header.
- Stat tiles join into one strip: a single card with equal columns divided by 1 px hairlines and 16 px padding. Label 12 px/510 `--text-tertiary` with an optional tone dot, value 24 px/590 `--text-primary` in tabular numerals, hint 12 px `--text-tertiary`. Values are never colored and there are no icon tiles.

**Lists and tables** (list pattern)

- Header row: 32 px, sticky, `--bg-raised`, 12 px/510 `--text-tertiary`, sentence case, bottom hairline.
- Rows: 40 px minimum (32 px for `.table--compact`), 16 px side padding, a `--border-subtle` hairline underneath. Hover `--bg-hover`, selected (`.row-selected`) `--bg-selected`. On clickable rows (`.row-clickable`) the whole row is the hit target, with an inset focus ring.
- Cells: the key column (route, SQL, error name) is 13 px `--text-primary`. Metadata is 12 or 13 px `--text-secondary`. Durations, counts and times are right-aligned and tabular. Ids, SQL and trace ids are 12 px mono.
- Group header: 32 px, `--bg-raised`, 12 px/510 `--text-secondary` with a count.
- Pagination: a 40 px footer row with the range in 12 px `--text-tertiary` on the left and two 24 px ghost icon buttons on the right.
- Toolbar (`.toolbar-card` on five list pages, `.filter-chip` on Database): not a card. It becomes a 40 px filter row directly under the header bar with a bottom hairline. Search, selects, toggle and chips sit in it with 8 px gaps.

**Tabs**

- Items are 28 px high, 13 px/510, `--radius-sm`, 2 px apart, 10 px side padding, with no surrounding box. Inactive is `--text-tertiary`, hover is `--bg-hover` with `--text-secondary`, active is `--bg-selected` with `--text-primary`. Counts are 12 px tertiary numerals. The strip sits in a 40 px row with a bottom hairline, like a view header.

**Banners, disclosure, key-value rows**

- Banner (`.notice`, `.trace-warnings`, error state): 1 px border at 20% of its tone, fill at 8% of its tone, `--radius-md`, 8 px by 12 px padding, 16 px tone icon, 13 px text. Keep the tone each banner has today.
- Disclosure (the `Attributes (9)` row): 32 px row, 14 px chevron that rotates 90° in 150 ms, 13 px/510 `--text-secondary` label, tertiary count. No box, only a hairline above.
- Key-value rows (span details, run and baseline metadata): label column 120 px in 12 px `--text-tertiary`, value 13 px `--text-primary`, ids and paths in 12 px mono. Rows are 32 px high with no separators. Groups are separated by 16 px and a 12 px/510 `--text-tertiary` group label.

**Code, SQL, JSON**

- Blocks: 12 px/18 px mono, `--bg-raised` fill, 1 px `--border`, `--radius-sm`, 8 px by 12 px padding, `--text-secondary`, thin scrollbar on overflow. Inline code: 12 px mono, `--bg-hover` fill, `--radius-xs`, 0 by 4 px padding.

**Timeline and span panel** (`Timeline.tsx`, `.span-detail`)

- Waterfall rows are 28 px high, hover `--bg-hover`, selected `--bg-selected`. Indent 12 px per depth level with a 14 px collapse chevron. Bars are 12 px high, `--radius-xs`, 2 px minimum width, in the category colors from Step 1. Gridlines are 1 px `--border-subtle`. Tick labels and the duration column are 11 or 12 px tabular `--text-tertiary`. The category tag beside a span name becomes plain 11 px `--text-tertiary` text. The legend uses 8 px round dots.
- The span panel follows a properties sidebar: 360 px wide, left hairline, full height of the content area, 40 px header (label and status chip), the span name, an "Open request" secondary button, then key-value rows and the Attributes disclosure. Below 900 px it stacks under the timeline.

**Empty, loading, charts, overlays**

- Empty state: centered column, 360 px max, 48 px vertical padding, a 20 px icon in `--text-tertiary` with no tile, title 13 px/590, description 13 px `--text-tertiary`, optional secondary button.
- Loading: 32 px skeleton rows with `--radius-xs` and a slow shimmer between `--bg-hover` and `--bg-selected`. Stop the shimmer under `prefers-reduced-motion` and keep the `role="status"` text.
- Charts (`latency-chart` on Overview): 1 px `--border-subtle` gridlines, 11 px `--text-tertiary` labels, bars with `--radius-xs`, one data color (`--accent-fill`) unless the data carries a tone (slow orange, error red).
- Overlays, if any (custom menus, tooltips, dialogs): `--bg-overlay`, 1 px `--border`, `--shadow-menu`, `--radius-md` (`--radius-lg` for dialogs), 28 px menu items, 12 px tooltip text.

## Step 4: screens

Apply Steps 1 to 3 to every screen. This section lists only what is specific to each one. Keep every string, card title and section that exists today.

**List pages** (Requests, Traces, Database, Errors, Diagnostics, Test runs, Baselines, Comparisons)

- Header bar with breadcrumb and actions, the intro line, an optional stat strip, the 40 px filter row, then one edge-to-edge table or list with pagination. Rows open their detail page and take the focus ring.

**Detail pages** (request, trace, error, diagnostic, run, baseline, comparison)

- Back breadcrumb and Copy id and Refresh in the header bar, the 24 px title with inline chips, the meta line, then banners, tabs if any, and the content.
- Metadata cards (Details, Fingerprint, Environment and the "… details" cards) become a 360 px properties rail on the right, built from key-value rows with a hairline on its left. Everything else stays in the main column. The rail stacks below the main column at 900 px and under.

**Screens**

- **Overview** (`/`): the stat strip (Requests, Error rate, p95 latency, Slow requests). Instrumentation coverage next: the status counts become chips in the card header, and the items become a two-column list on wide screens. Each row has a fixed-width status chip column so labels line up, plus right-aligned meta (count and age, category) in `--text-tertiary`. Diagnostic findings follow, with "View all" as a ghost button with a trailing arrow icon and issue-style rows (severity chip, title, right-aligned route and age). Then Recent request latency, Local app connections, Slowest requests and Recent errors in the existing grid with 16 px gaps. Restyle every empty state as well: "No diagnostic findings", "No requests captured yet", "No recent requests", "Waiting for an app", "No slow requests", "No errors captured".
- **Requests**: the filter row holds the search, three selects and the "Slow only" toggle. Columns stay as they are. Slow rows keep their flag as an orange dot beside a neutral duration, not a colored number.
- **Request detail and Trace detail** (one component, two modes): the Evidence warnings banner sits above the tabs (Timeline, Errors, Database, Raw), which get their own 40 px row under the title block. The Timeline tab is a split view with the waterfall on the left and the 360 px span panel on the right, showing the "Select a span" empty state until a span is chosen.
- **Traces**: filter row with search and one select, then the same table pattern as Requests.
- **Database**: filter row with search, the system select, the duration select and the chips. Redacted SQL stays in mono and wraps to at most two lines, as today, beside the system chip, operation, duration (n/a in `--text-tertiary`), trace id in mono and age. Selecting a row opens "Query detail" in the same 360 px right panel the spans use.
- **Errors**: filter row with the two search inputs. Errors stay grouped by fingerprint: each group is a header row (name, message, count chip) with its occurrences beneath as clickable rows. **Error detail**: Stack trace, Attributes and Correlated trace in the main column, with Details and Fingerprint in the rail.
- **Diagnostics**: stat strip, filter row (two searches, three selects), findings as issue-style rows. The "Sample notes" callout becomes a neutral banner. **Diagnostic detail**: What the evidence shows, Span evidence, Query evidence, Error evidence, Related trace, Verification and Limitations in the main column, with Details and Fingerprint in the rail.
- **Testing** (Test runs, Baselines, Comparisons): list pages with their stat strips and empty states ("No saved test runs", "No baselines saved", "No comparisons saved"). Do not add navigation between them that does not exist today. **Run detail**: stat strip, the Scenarios section, the "Use this run" command block with its copy button, Warnings & limitations as a banner, and Capture details in the rail. **Baseline detail**: the same shape, with Baseline details in the rail and the "Compare against this baseline" command block. **Comparison detail**: the status (improved, regressed, unchanged, inconclusive) as a chip with its tone dot in the title block, the stat strip, Scenario results and Method in the main column, and Comparison details and Environment in the rail, with mismatched rows marked by an orange dot. Rebuild `RegressionScenarios.tsx` from the same list, row, chip and key-value primitives, with metrics in aligned tabular columns and no bespoke styles.
- **MCP & settings**: one column capped at 720 px. Each card becomes a settings section: title at 13 px/590 with its 12 px `--text-tertiary` subtitle above a bordered group (`--radius-md`) of rows, label and description on the left, value or control on the right, 1 px `--border-subtle` between rows. The MCP config and commands stay as code blocks with copy buttons. Data safety items become rows with a tone dot. Appearance keeps its three choices (Dark, Light, System) as selectable tiles: 1 px `--border`, `--radius-md`, and a selected tile with an `--accent` border and `--accent-bg` fill.
- **404**: centered column with "404" at 24 px/590 in `--text-quaternary`, the title at 15 px/590, the description at 13 px `--text-tertiary` and a primary "Back to overview" button.

## Step 5: build order and checkpoints

Work on a new branch and commit at the end of every checkpoint. A checkpoint is done when `pnpm typecheck` and `pnpm build` pass and you have looked at fresh screenshots of every route it touched, in both themes. Never start the next checkpoint on top of a broken one.

**Checkpoints, in order**

1. **Foundations**: install the self-hosted Inter Variable font, write the Step 1 token layer, and reset the base styles: box-sizing, body font and color, `color-scheme`, selection color, thin scrollbars, the focus ring and the reduced-motion rule. Delete the `body::before` grid, the sidebar blur and every gradient except the logo mark. Confirm the collector really serves the font files. If its static handler in `packages/cli` uses an extension allowlist or a MIME map, add `.woff2` as `font/woff2` with the smallest possible change, leave the CSP alone, and say so in your report.
2. **Shell**: sidebar, content panel, header bar with the `PageHeader` slot, responsive drawer and content footer. From here on every route sits inside the new frame, even if its body still looks old.
3. **Primitives**: build each Step 3 component once in `components/ui.tsx` (or a file beside it), then restyle `Icon.tsx` and `Timeline.tsx`. Keep a running map in your plan of every legacy class and the primitive that replaced it. Never keep two implementations of the same thing.
4. **Screens**, in this order: Overview, Requests, Request and Trace detail, Database, Traces, Errors and Error detail, Diagnostics and Diagnostic detail, the three Testing lists and their detail pages (with `RegressionScenarios.tsx`), MCP & settings, 404. Recapture each screen as soon as you finish it.
5. **States**: restyle every empty, loading, error and waiting state on every screen, plus any reconnecting or connection-lost state that exists today. Rows arriving over the SSE feed must not flash, animate or shift the layout.
6. **Cleanup**: delete every class in `styles.css` that nothing references, every unused component and every inline style that a token or primitive now covers. The stylesheet should end far shorter than today's roughly 3,000 lines.
7. **Docs**: replace the README screenshots in `docs/screenshots/` (`overview.png`, `overview-dark.png`, `overview-mobile.png`, `request-detail.png`, `database.png`, `traces.png`, `errors.png`, `error-detail.png`, `settings.png`) with fresh captures of the same views, at the same file names and dimensions, taken from the example app with its demo data. Add a `CHANGELOG.md` entry in the format that file already uses.

**When a decision is not covered**

- Choose the quieter option: less color, less contrast between neighbors, fewer borders.
- Reuse an existing token and primitive. Never add a one-off value to fix one screen. Add to the scale only when two or more places need it, and list the addition in your report.
- Reference screenshots, if attached, outrank this document. Where they disagree, follow the screenshot and note which value you changed.

## Step 6: verify

Verification has three parts: the content did not change, the system is consistent, and the repo's own checks still pass. Write the audit scripts in a scratch folder outside the repo. Playwright is already installed for the repo's e2e run.

**Content parity**

- Run the same capture script you used for the Step 0 screenshots on the base commit (a `git worktree` of the commit you branched from works) and on your branch, with the same seeded data and the same demo traffic. For each of the 17 routes, record the whitespace-collapsed `document.body.textContent`, the set of link `href`s, and the sets of `aria-label`, `title`, `placeholder`, button and tab labels. Replace every digit with 0 before comparing, since ages and timings differ between runs.
- The two sets must match. Order may differ only where Step 2 moved a title, eyebrow or description. Anything added, removed or reworded is a bug. `textContent` ignores CSS, so dropping the uppercase styling does not count as a change.
- Each route still has exactly one `h1`, and every landmark, role, `aria-*` attribute and live region that exists today is still there.

**System consistency**

Write a script that walks every visible element on every route, in both themes, at 1440 px and 390 px wide, and fails on any computed value outside these lists. Fix offenders at the source; never add them to the lists.

- **Type**: font family is Inter Variable (Inter Display from 20 px up), with the mono stack only on SQL, ids, URLs and JSON. Sizes are 11, 12, 13, 15, 20 and 24 px, weights 400, 510 and 590, letter spacing 0, -0.01em and -0.02em, text-transform none.
- **Shape**: border radius 0, 4, 6, 8 or 12 px, or full.
- **Elevation**: box-shadow none, except on menus, popovers, dialogs and the mobile drawer. Background image and backdrop filter none, except the logo mark and the skeleton shimmer.
- **Sizes**: header bar, filter row and pagination footer 40. Table header, group header, key-value row and disclosure row 32. Table row 40 (32 compact). Nav item, tab and waterfall row 28. Button 24, 28 or 32. Chip 20.
- **Color**: resolve every token from `:root` for the active theme, then confirm that every computed `color`, `background-color` and `border-color` is a token or an alpha variant of one. Print offenders with their selectors.

Then run these static checks from `packages/dashboard`. Each should print nothing, apart from the token block, the logo SVG and the skeleton shimmer:

```sh
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' src
grep -rnE 'font-size:\s*[0-9.]|font-weight:\s*[0-9]' src
grep -rnE 'border-radius:\s*[0-9.]' src
grep -rnE 'text-transform:\s*uppercase' src
grep -rnE 'gradient|backdrop-filter|blur\(|!important' src
grep -rnE 'style=\{\{' src
```

The remaining `style={{` hits must be computed geometry only: waterfall bar offsets and widths, chart bar heights. Also list every padding, margin and gap in px and flag any that is not a multiple of 4 or one of the allowed 2 and 6.

**Accessibility, motion and responsive**

- **Contrast**: compute the ratio for every text token on every surface it sits on, in both themes, and for each semantic text color on its banner fill. Everything except `--text-quaternary` must reach 4.5:1. Put the table in your report.
- **Keyboard**: tab through every route from the top. Every interactive element shows the focus ring in both themes, the order matches the visual order, whole-row targets open on Enter, and tabs, toggles, selects, disclosures and the theme control work from the keyboard as they do today.
- **Motion**: with `prefers-reduced-motion: reduce`, no transition or animation runs and the skeleton shimmer stops.
- **Responsive**: at 1440 × 900, 1024, 900, 899 and 390 px wide, and at 200% zoom, the page never scrolls sideways. Wide tables and code blocks scroll inside their own container, the drawer opens, closes and keeps focus as before, and the span, query and properties rails stack under their content below 900 px.
- **Themes**: dark, light and system all work, system follows an OS change live, the choice persists under `stacknext-theme`, and a reload shows no flash of the wrong theme.
- **Network**: on every route the only requests go to the collector's own origin, the font files load with a 200 and a font MIME type, and the console shows no CSP violations.
- **Live updates**: with traffic flowing, new rows, counts and chips update in place with no flash, no animation and no layout shift under the cursor.

**Visual review**

- Look at every screenshot, not a sample: every route, both themes, both widths. Judge each screen against the three goals for the redesign: less visual noise, strict alignment, and clearer hierarchy and density in the chrome.
- If reference screenshots were attached, put each StackNext screen beside its closest reference counterpart and fix density, alignment, color weight and type before anything else: the sidebar and header against any reference view, Requests against the issues list, Request detail against an issue with its properties panel, MCP & settings against a reference settings page.
- Flip between screenshots of two different pages. Header, rows, chips, buttons, tabs and empty states should match in size, spacing and weight. A screen that stands out is not finished.

**Repo checks**

Run these from the repository root, in this order. All of them must pass. `pnpm test:e2e` needs the packages built and Playwright Chromium installed.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm check:docs
```

- If a test selects by a class name you removed, move it to a role or text query rather than keeping a dead class. Never loosen an assertion about data or redaction.
- When you stop `stacknext dev`, send it SIGINT or SIGTERM so it removes `.stacknext/run.json`, then check ports 4400 to 4425 for orphaned `next dev` processes, as AGENTS.md requires. Never commit anything under `.stacknext`.
- `git diff --stat` against the base should show only `packages/dashboard`, the font dependency in the dashboard's `package.json` and `pnpm-lock.yaml` (if you used the package), `docs/screenshots`, `CHANGELOG.md`, any test selectors you had to change, and at most one small MIME change in `packages/cli`. Anything else needs an explanation in the report.

## Done when

- Every route in Step 4 renders in the new system, in dark and light, at desktop and 390 px, with its empty, loading and error states restyled.
- The content-parity diff is clean, the computed-style audit reports zero violations, the static checks are clean and the contrast table passes.
- `pnpm lint`, `typecheck`, `test`, `build`, `test:e2e` and `check:docs` all pass.
- The token layer is the only place a color, size, radius, shadow or duration is defined, and `styles.css` holds no class that nothing uses.
- The diff stays inside the file list in Step 6.
- Any two screens read as one system: same header height, row height, chip, button, tab and empty state everywhere.

## Report back

End with a short report, not a log of every edit.

- What shipped: the branch name, the commits per checkpoint, and where the tokens and primitives live.
- Before and after numbers: lines in `styles.css`; distinct font sizes, radii, shadows and gradients; inline style objects.
- Every deviation from this document and why, including values taken from a reference screenshot, any token you added, and the `.woff2` handling if `packages/cli` needed a change.
- The contrast table, and where the before and after screenshots and the audit output are saved.
- Anything you could not verify or left undone, with the reason.
