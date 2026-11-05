# StackNext dashboard design

This document describes the dashboard's shared visual language. It applies to
the React/Vite dashboard in `packages/dashboard` and is written for maintainers
adding a page or changing an existing one. The dashboard is local-first: it
shows sampled telemetry, never implies more certainty than the sample supports,
and never introduces a remote service or a second design system.

## Principles

1. **The sample is the interface.** Numbers, status glyphs and labels describe
   what the current collector sample proves. They are evidence, not a score.
2. **Quiet chrome, clear data.** The sidebar and topbar are stable. Page titles,
   cards, rows and controls carry the hierarchy through spacing and type, not
   through nested borders or competing colours.
3. **One component language.** Cards, list rows, status glyphs, segmented
   summaries, KPI tiles and icon buttons behave the same on every route.
4. **Progressive disclosure.** Show the useful summary first. Group repeated
   findings and errors, collapse unsupported coverage rows, and reveal details
   in place without losing the parent context.
5. **Keyboard and pointer are peers.** Every interactive surface has a visible
   focus state, an accessible name and the same action for mouse, touch and
   keyboard.

## Layout

### Shell

- Content column: `24px` padding on desktop (`16px` below `900px`), `16px`
  between page sections.
- Overview content: maximum width `1440px`, centred. The page header and the
  overview grid share the same `overview-page` column so the title aligns with
  the cards at every width.
- Overview grid: a 12-column CSS grid with `16px` gaps.
  - KPI strip: four equal columns above `1024px`; `2 x 2` at `1024px` and
    below.
  - Paired rows: `6 / 6` columns for chart + slowest requests and findings +
    errors above `1024px`; full-width stacked cards at `1024px` and below.
  - Coverage: full-width `12` columns.
- Paired cards stretch to the same height in a row. A card never grows a second
  nested card surface just to fill space.
- The content area scrolls vertically; the shell does not. Horizontal overflow
  is never allowed at the supported widths.

### Breakpoints

The Overview layout uses two literal viewport breakpoints plus one container
query. The viewport queries are deliberate: the supported window sizes are
fixed and the shell already changes at viewport thresholds, so a `1280px`
window always means the same content width. The `< 600px` single-column
fallback remains a container query because it depends on the card column, not
the window.

| Width | Layout |
| --- | --- |
| `>= 1280px` | Four KPI tiles; chart + slowest requests and findings + errors side by side; coverage split into two real tables with a continuation header. |
| `1025px - 1279px` | Four KPI tiles and paired cards side by side; coverage is one table with Category as its own column. |
| `<= 1024px` | KPI tiles in `2 x 2`; paired cards stack; coverage is one table without Category. |
| content `< 600px` | Single column; chart header wraps; coverage hides Volume; labels wrap and descriptions clamp to two lines. |

The shell breakpoints are separate: the sidebar becomes a drawer at `900px`,
the dashboard URL disappears below `1100px`, the project name below `900px`,
and the topbar status area collapses below `640px`.

## Tokens

Use the custom properties in `packages/dashboard/src/styles.css`; do not add
one-off hex colours.

### Type

| Token | Value | Use |
| --- | --- | --- |
| `--font-sans` | Inter Variable, system sans | Body, headings, controls |
| `--font-mono` | IBM Plex Mono, system monospace | Methods, routes, ids, status codes |
| `--fs-micro` | `11px / 16px` | Table headers, secondary metadata |
| `--fs-small` | `12px / 16px` | Captions, legends, row secondary text |
| `--fs-base` | `13px / 20px` | Body and primary row text |
| `--fs-large` | `16px / 24px` | KPI units and compact section headings |
| `--fs-title-2` | `20px / 28px` | List-page titles |
| `--fw-normal` / `--fw-medium` / `--fw-semibold` | `440` / `530` / `590` | Body / row emphasis / headings |

### Space, shape and motion

| Token | Value |
| --- | --- |
| `--sp-1` … `--sp-8` | `4, 8, 12, 16, 20, 24, 32px` (`--sp-2-5` is `10px` for optical alignment) |
| `--row-h` / `--row-h-lg` / `--row-h-list` | `32 / 40 / 40px` |
| `--radius-xs` / `--radius-sm` / `--radius-md` | `4 / 6 / 8px` |
| `--radius-lg` / `--radius-xl` | `10 / 12px` |
| `--dur-fast` / `--dur` | `100 / 150ms` |
| `--ease` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` |

### Semantic colour

Both themes define the same semantic names:

- Surfaces: `--surface-0` (content), `--surface-1` (raised card), `--surface-2`
  (overlay/tooltip).
- Text: `--text-primary`, `--text-secondary`, `--text-tertiary`,
  `--text-quaternary`.
- Lines: `--border`, `--border-subtle`, `--border-strong`.
- Status: `--success`, `--warning`, `--danger`, `--info`, `--neutral`.
- Data: `--chart-ok` for normal request bars.
- Utility: `--focus-ring`, `--status-knockout` for the knockout detail inside a
  filled status glyph.

`--status-knockout` is the surface colour behind a filled glyph. It lets the
check, exclamation and information marks read as cut-outs rather than as a
second foreground colour.

## Status glyphs

Status is carried by **shape and colour together**, using `StatusIcon` from
`components/ui.tsx`. A status is never a rounded status pill. Pills are reserved
for neutral counts and clickable filters.

| Status | Shape | Meaning |
| --- | --- | --- |
| `observed` | Filled circle with a knockout check | The current sample contains evidence for this signal. |
| `not-observed` | Hollow circle | The signal exists but this sample has no evidence. Not proof of failure. |
| `unknown` | Dashed hollow circle | The collector cannot determine the state from this sample. |
| `unsupported` | Hollow circle with a slash | The feature is outside the supported surface. |
| `active` | Hollow circle with a filled centre | A configured feature is currently active. |
| `configured` | Hollow circle with a minus | Configured, with no stronger sample evidence. |
| `error` | Filled circle with an exclamation | Error severity or a failed request. |
| `warning` | Filled triangle with an exclamation | Warning severity or a threshold breach. |
| `info` | Filled circle with an information mark | Informational evidence. |
| `neutral` | Small filled circle | Neutral count or unknown non-status decoration. |

Glyphs accept an explicit `label`; otherwise they use their readable default.
They render as `role="img"` with `aria-label` and a matching `title`, and are
paired with visible text wherever the status changes the interpretation. The
same shape vocabulary is used in KPI context, finding rows, error rows and the
coverage grid.

`MethodBadge` and `StatusCodeBadge` intentionally render plain monospace text
rather than coloured pills. A failed status code uses the danger text token; a
slow status is otherwise conveyed by the row, the chart and the magnitude bar.

## Components

### Card anatomy

Every Overview card except the KPI tiles uses one three-part anatomy:

- **Header** — a title and one stacked subtitle on the left, and exactly one
  right-slot item (a `View all` link, or the latency legend). Overview headers
  do not put meta inline beside the title. A header with both lines is `60px`
  tall with `12px` vertical and `16px` horizontal padding.
- **Body** — the same `16px` horizontal inset as the header and footer. List
  cards use `4px 16px 16px`; the rows themselves are inset, never full-bleed.
  Severity and coverage bars start at the same inset.
- **Footer** — pinned to the bottom by the card's flex column, with
  `min-height: 36px` on Overview. Side-by-side cards' footers align on the same
  line. Every non-KPI card has a footer that states scope or provenance rather
  than repeating the title.

`Card` keeps one raised surface and its existing hairline ring and never nests
another card. The body absorbs the remaining height. An empty sample shortens
the content, not the card: paired cards stay equal height and rows are never
spaced or centred to fill the gap. Empty and error states live inside the body,
and an error in one data source does not blank the rest of the page.

### KPI tile

`KpiTile` is an interactive `button`, not a static statistic.

- Label row: a `12px` label plus an optional `14px` status glyph on the right.
  Value: a `24px` tabular numeral with a `16px` unit. Context: `12px`. These are
  the only type sizes in the overview card system: `11 / 12 / 13 / 16 / 24px`.
- The sparkline is `28px` tall and sits on the bottom edge, so all four tiles
  share a baseline even when one has no data. Bars scale to their own series;
  zero values use the border token and a `2px` mark, so “no events” is not
  mistaken for activity. Bar tooltips name the time and value.
- The whole tile is one target. Hover raises the surface; focus uses the shared
  focus ring.
- The accessible label repeats the value, context and destination so the visual
  composition is not required to understand it.

### Latency chart

`LatencyChart` is plain React + CSS; there is no chart dependency.

- The latest 24 requests are sorted oldest to newest. The axis maximum is
  rounded up from the slowest value (and never below the configured
  slow-request threshold), and bars use that same maximum.
- Bars are buttons: hover or focus shows the route, status, duration and time;
  click opens the request trace. The tooltip measures its own width and clamps
  inside the plot, so edge bars do not clip it.
- Colour follows outcome: `--chart-ok` normal, `--warning` slow,
  `--danger` error. The legend names the threshold.
- A dashed threshold line appears only when the threshold falls inside the
  plotted range. Its label is shown once at the axis edge and is suppressed when
  it would collide with a gridline label. The threshold is also named in the
  header legend.
- The top, middle and zero axis labels share the rounded maximum, so the scale
  never implies a different value from the bar heights. Axis labels use compact
  duration parts (`1.5 s`, `750 ms`) from `formatDurationParts`, not a second
  formatting scheme. The x-axis shows the sample's actual start/middle/end
  times. The chart states the window in its subtitle; it does not imply a longer
  history.
- The footer states “Axis rounded up from the slowest” and the error/slow counts
  for the same 24-request window. The chart card has a footer like every other
  non-KPI card.

### List rows

`ListRow` is the shared row for slow requests, grouped findings and grouped
errors.

- Grid: a fixed leading slot (`16px` status glyph, or `36px` method badge), a
  flexible text column, a fixed right-aligned trailing slot (`36px`) and an
  optional `16px` chevron slot. `reserveChevron` keeps the slot when a row has
  no glyph, so trailing numbers stay aligned down the list.
- Overview list rows are `44px` tall. Primary text is `13px`; secondary text is
  `12px`. Both truncate with ellipsis and expose the full value through `title`.
  Error rows render `name` plus a mono message on the primary line, with
  `route · last seen` below; the name is capped at 40% so the message keeps the
  remaining width.
- Leading method badges, status glyphs and chevrons use the same size and
  vertical alignment on every row. Icon-only affordances carry `aria-label` and
  a matching `title`.
- Counts (`×3`) are sans `11px` tabular numerals formatted with `formatNumber`,
  never monospace. Mono is reserved for routes, paths, SQL and error messages.
- Lists show up to five already-loaded rows or groups: the latest 24 requests
  grouped by method + route for slow requests, and full-sample error groups.
  Footers state the visible scope (`Showing 5 of 16`) and the grouping rule.
  Rows are never duplicated, padded or centred just to fill the card.
- The entire row is a button with hover and focus states. Primary text is never
  the only target. Repeated findings group by `ruleId + route + title`, so a
  group title describes every occurrence, and expand to their occurrences in
  place. Repeated errors group by fingerprint; the count is visible and the row
  opens the latest occurrence.

### Data tables

The HTTP requests table is the reference implementation for list tables. Traces
and database reuse the same `.list-page`, `.list-toolbar`, `.list-table` and
footer/state contract, so all three pages share one layout. Each uses a real
`table` inside `.table-scroll` with a fixed layout, so row semantics, focus
handling and the existing table surface keep working.

- **Page column.** `.list-page` shares `--overview-max` (`1440px`) and is
  centred. The page header, toolbar, table card and footer share the same left
  and right edges at every supported width.
- **Breadcrumb.** Project (muted) → section (muted) → page title (primary), with
  the same `chevron-right` icon between levels. `PageHeader` never adds a
  leading slash of its own.
- **Header.** The page title and one-line description match Overview. Refresh
  is the only action and its right edge aligns with the table. It is `28px`
  high, keeps its width while loading, spins its icon, sets `aria-busy` and is
  disabled until the request settles.
- **Toolbar.** One row at desktop widths: search, method, status, `Sort:`, slow
  toggle, then the right-aligned result count and a conditional ghost
  `Clear filters` button. Controls are `28px` high with `8px` gaps; the search
  starts at `280px` and may shrink to `200px`. `Sort:` is muted, never a
  control label in the reading order. The request set needs about `930px`, so
  at `1260px` and below the shared `.list-toolbar__search` slot takes its own
  row and the controls/count move to the next row, wrapping again at very
  narrow widths. Traces and database use the same wrapper and breakpoint.
- **Toggle.** The label is inside the `<label>`, so clicking
  `Slow only (> 250 ms)` toggles the filter. The number comes from the
  collector's `slowRequestMs` (falling back to `250ms`), not a second constant.
- **Columns.** `Request | Status | spacer | Duration | Errors | DB queries |
  Spans | When | chevron`. Request is `min(420px, 48%)` with a fixed method
  slot and a truncated route plus mono trace id. Status is `52px`. Metrics use
  fixed widths (`88/64/92/64/84px`) and right-aligned tabular numerals with
  equal `16px` gutters; the auto-width spacer absorbs leftover space so metrics
  never float away from their headers.
- **Rows.** `40px` high and fully clickable with `Enter`/`Space`, hover and
  focus states. The row `title` repeats method, route, status, exact duration,
  error/DB/span counts, absolute timestamp and slow state, so data hidden by a
  responsive rule is still available on hover.
- **Errors.** A danger count badge appears only when `errorCount > 0`;
  otherwise the cell renders a muted `—`. DB queries and Spans are plain muted
  numbers, not badges.
- **Duration and time.** Duration has a reserved `6px` dot slot; the dot only
  appears for slow requests and its tooltip names the threshold. When shows
  relative time with the absolute timestamp in `title`.
- **Status.** Plain mono text, not a pill. 4xx uses the warning text token and
  5xx/failed uses danger. Reason phrases (`404 Not Found`) are tooltips only.
- **Footer.** When the filtered total is at most one page (`50`), the footer
  shows `Showing N requests · <sort>` on the left and `N errors · N slow` on
  the right, with singular/plural matching the counts. When `total > 50`, the
  same slot becomes pagination (`1–50 of N`, previous/next, page number)
  instead of stacking a second strip. An empty result has no footer.
- **States.** Loading renders eight `40px` skeleton rows under the real table
  header, with `role="status"` on the scroll region. Empty and no-match states
  centre inside `min-height: calc(40px * 5)`; a filtered empty state offers
  `Clear filters` and the unfiltered state shows the `stacknext dev` hint.
- **Responsive.** At `<=1100px` the DB queries and Spans columns are hidden (the
  row tooltip keeps their values) and the search gets its own toolbar row. At
  `<=640px` only Request and Status remain visible. No breakpoint introduces
  page-level horizontal scrolling.

### Traces and database tables

- **Shared shell.** Both pages use `.list-page`, `.list-toolbar`, `.list-state`,
  `40px` rows, a real table inside `.table-scroll`, one card footer and the same
  loading/empty/error states. A metric column has a `16px` left gutter, the
  first and last cells keep `16px` outer gutters, and the empty result has no
  footer strip. `ListTableSkeleton` renders the real headers with eight
  two-line identity rows and right-aligned metric bars.
- **Traces.** `Root operation | Service | Duration | Spans | Errors | Started |
  chevron`. Root is auto width, service `168px`, duration `88px`, spans and
  errors `64px`, started `84px` and chevron `32px`. The duration dot slot is
  driven by `trace.request.slow` and the collector's `slowRequestMs`; the row
  title keeps service, span count, errors, database queries, absolute start
  time and slow state. The footer shows `Showing N traces · <sort>` plus error
  and span totals for one page, and pagination above `50`.
- **Database.** `SQL | System | Operation | Duration | Trace | When | chevron`.
  SQL is auto width, system `92px`, operation `104px`, duration `88px`, trace
  `120px`, when `84px` and chevron `32px`. SQL is one truncated mono line with a
  muted route subtitle; the full value remains in the cell `title`. System is
  plain muted mono, not a badge. The footer shows `Showing N queries` plus
  failed and unmeasured totals for one page, and pagination above `50`.
- **Responsive columns.** Traces hides Service and Spans at `<=1100px`, then
  Started and the chevron at `<=640px`. Database hides Operation at `<=1100px`,
  Trace and When at `<=900px`, then System and the chevron at `<=640px`. The last
  visible metric keeps a `12px` right gutter, and the row `title` always retains
  the hidden values. No breakpoint introduces page-level horizontal scrolling.
- **Selection.** Selecting a database row opens the query detail rail next to
  the table; below `1100px` the rail stacks directly below the table card while
  the selected row stays highlighted.

### Segmented summary and filters

`SegmentBar` combines a proportional status bar with a clickable legend.

- The bar shows the distribution at a glance; the legend exposes each count and
  label as a button.
- Selecting a segment filters the list below. Selecting it again clears the
  filter. `aria-pressed` and `is-active` stay in sync.
- The legend total is derived from the same item array as the rows. This avoids
  the old mismatch where a status count came from a report total but a row was
  filtered out of the table. Severity counts likewise come from the previewed
  finding groups, not the full diagnostic report.
- A filter whose count reaches zero after a refresh is cleared automatically.
  Empty filtered states also offer an explicit clear action, including the
  coverage grid.
- Neutral pills are acceptable here because they are counts and filter targets,
  not status claims.

### Coverage grid

Coverage is evidence, not a percentage or a health score.

- A facts strip above the grid reports the Next.js and SDK versions, exported
  span count, last export and collector uptime from existing metadata. The
  legend counts come from the rendered rows, including the verbose row.
- The grid has status, signal (name plus a one-line description), category,
  volume and last seen. Volume is a bounded magnitude bar and count, not a
  percentage. Rows are `44px`, share the card's `16px` inset, and truncate text
  with title tooltips.
- Category is its own muted column between `1025px` and `1279px`. At `>= 1280px`
  it folds into a muted suffix beside the signal name so two columns fit. At
  `<= 1024px` it is hidden entirely.
- Below `1280px` the grid is one accessible `role="table"` with one header and
  continuous rows. At `>= 1280px` React renders two real tables split at the
  midpoint, each with its own header; the second header reads “Instrumentation
  coverage continued”. The split is presentational only: row set, order and
  counts are unchanged.
- Unsupported runtime rows are collapsed behind a labelled disclosure
  (`Show 3 unsupported by runtime`). The legend still shows their count, and
  expanding the disclosure makes all rows countable.
- A missing signal is `not-observed` or `unknown`; it is never rendered as
  “broken”. The footer repeats that the sample is not a score and points to
  `stacknext coverage` for the full limitations.

### Icon buttons, live controls and shortcuts

- Icon-only controls use `IconButton`: a `button`, an `aria-label` equal to the
  tooltip/title, and a visible focus ring.
- Refresh is icon-only with `Refresh (R)`. While a reload is in flight the icon
  spins and `aria-busy="true"` is set. The `R` shortcut is ignored while a text
  field, textarea, select or content-editable element has focus.
- Pause/Resume is available only on Overview. Pausing stops the client from
  applying SSE refresh keys and suspends the Overview interval loads. New
  telemetry still increments the live sequence, so the button shows an honest
  `N new` count. Resuming applies the pending refresh once.
- The Errors nav badge dot uses a persisted latest-error marker (timestamp and
  id) from the existing error list, not a count. Visiting the errors list or an
  error detail advances the marker. Retention eviction and collector restarts
  therefore do not fabricate “new errors”.
- Live refresh defers while the pointer is over a row, table row, chart bar or
  coverage row, so a hovered target does not disappear underneath the cursor.

## Content rules

- State the sample window and its limitations. Use “in this sample”, “not
  observed”, “possible” and “inconclusive” when that is what the evidence says.
- Never claim a root cause, statistical significance, a composite score or a
  production guarantee.
- Findings remain deterministic rule output. `possible` and `observed` are not
  confirmed causes.
- Redacted text stays visibly redacted (`[redacted]`); the UI must not hide the
  fact that redaction occurred.
- Do not put tokens, query strings, SQL bind parameters, headers, bodies,
  screenshots or local paths into the UI, exports, screenshots or docs.
- Keep existing route names, API endpoints and copy meaning. Visual changes do
  not introduce new data sources.

## Accessibility

- Every interactive element is a native `button`, `a`, `input` or `select`.
- Focus uses `--focus-ring` with an offset that remains visible in both themes.
- Status is never colour-only: glyph shape, text label, `aria-label` and
  `title` agree.
- `aria-busy` reports refresh work; `aria-pressed` reports pause and active
  filters; `aria-expanded` reports disclosure rows and grouped findings.
- The coverage grid exposes `role="table"`, row, column header and cell
  semantics with an `sr-only` Status header. The two-column split gives each
  table its own accessible name.
- The chart exposes a screen-reader summary plus one labelled button per bar.
- `prefers-reduced-motion: reduce` removes the live-dot pulse, skeleton pulse,
  spinner rotation and row/card transitions without changing layout.
- Shortcuts never fire from editable fields. The command menu keeps its own
  focus trap and the sidebar drawer restores focus to its trigger.

## Verification

Overview cards are checked at `1920`, `1440`, `1280` and `1024px` in dark,
`1440px` in light, plus a `390px` narrow check. The checks cover:

- no horizontal scroll in the document or the content scroller;
- equal paired-card heights on desktop, `60px` headers, `36px` footers and
  `44px` list/coverage rows;
- exactly five computed text sizes in the overview cards: `11 / 12 / 13 / 16 /
  24px`, with tabular numerals and mono only on routes, paths, SQL and error
  messages;
- zero, one, five and many rows; long error names and messages; zero errors and
  an all-unobserved coverage sample, all without changing card height
  relationships or truncating controls;
- the chart rendering 24 labelled bars with a threshold only when in range, a
  rounded axis maximum and a tooltip clamped inside the plot at both edges;
- coverage counts matching the item rows (11 visible + 3 unsupported, or 14
  after expansion), one continuous table below `1280px`, two tables at `1280px`
  and above, and no Category column at `1024px`;
- grouped findings expanding to their occurrences;
- refresh spinner / `aria-busy`, pause / `N new`, resume and filter states;
- stale filter recovery and the persisted unseen-error marker;
- no console errors.

The request table is checked at `1920`, `1440`, `1280` and `1100px`, plus a
`640px` narrow check, with `0`, `1`, `50` and `100+` records:

- one chevron per breadcrumb level, muted ancestors and a primary current page;
- header, toolbar, card and footer sharing both edges, with Refresh aligned to
  the table's right edge and the same `28px` height as toolbar controls;
- a single toolbar row at desktop widths, `Clear filters` only while a filter is
  active, a working toggle label and a right-aligned live count;
- `40px` rows, fixed right-aligned metric columns, an error badge only above
  zero and em-dashes elsewhere, a reserved slow-dot slot and absolute-time
  tooltips;
- pagination at more than `50` rows, the footer summary at one page or fewer,
  singular/plural counts, and no empty footer strip;
- skeleton rows at `40px`, empty/no-match height of five rows, refresh spinner
  and disabled state without a width change;
- long routes truncating in place, `10+` error counts fitting the badge column,
  hidden DB/span values present in the row tooltip below `1100px`, and no
  document or content-scroller horizontal overflow.

The traces and database tables are checked at `1920`, `1440`, `1280`, `1100`,
`900`, `640` and `390px` with `0`, `1`, `50` and `50+` records:

- empty filtered and empty unfiltered samples, with no footer and a five-row
  minimum content height;
- one-row summaries with singular counts; 50-row summaries without pagination;
  pagination above `50` and working previous/next navigation;
- matching header, table, card and footer edges at every width, with no
  document, content-scroller or table-scroller horizontal overflow;
- skeleton rows, refresh spinner/disabled state, live counts, clear filters and
  the database trace chip;
- hidden-column tooltips at each breakpoint and the selected query rail stacking
  below the table at narrow widths;
- no change to colour tokens, opacity rules, card surfaces or the shared
  `Card`, `Button`, `Input`, `Select` and `Toggle` styles.

## Implementation map

| File | Responsibility |
| --- | --- |
| `packages/dashboard/src/pages/OverviewPage.tsx` | Overview composition, data loading, grouping, filters and evidence copy. |
| `packages/dashboard/src/pages/TracesPage.tsx` | Canonical trace table with the HTTP-request view, filters, sort, pagination, states, slow markers and row tooltips. |
| `packages/dashboard/src/pages/DatabasePage.tsx` | Query table composition, filters, pagination, states, trace chip and selected-row detail rail. |
| `packages/dashboard/src/components/ui.tsx` | `Card`, `KpiTile`, `ListRow`, `StatusIcon`, `IconButton`, `SegmentBar`, `Sparkline`, `InfoHint`, `PageHeader`, `Toggle`, `ListTableSkeleton`, `Pagination` and existing page primitives. |
| `packages/dashboard/src/components/LatencyChart.tsx` | Latency bars, outcome legend, data-scaled axis, conditional threshold and tooltip. |
| `packages/dashboard/src/App.tsx` | Shell, live refresh pause/apply behaviour and connection status. |
| `packages/dashboard/src/styles.css` | Tokens, shell, primitives, overview card layout, coverage breakpoints and reduced motion. |
