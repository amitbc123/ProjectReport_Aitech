# Export Plan — design notes

This file exists for whoever (human or AI) touches this repo next. It explains
how the whole app is put together, in enough depth that you shouldn't need to
re-read the entire `index.html` from scratch, and it documents *why* the
Export Plan feature was built the way it was — including a few non-obvious
decisions and one real bug that was found and fixed while building it.

The repo is a single file: `index.html`. No build step, no bundler, no
`node_modules`. SheetJS (`xlsx.js`, Apache-2.0) is pasted in verbatim inside
one `<script>` block so `.xlsx`/`.xls` files can be read with zero network
access. Everything else — CSS, markup, both dashboards' logic — lives in
that one file. Keep it that way unless there's a strong reason not to.

## 1. How the existing "Project Report" page works

This section is a map of the code that was already here, for context. It was
**not modified** by the Export Plan work beyond being wrapped in a new
`<div id="page-report">` container (see §3) — every id, class and function
inside it is untouched.

- **Source format**: a daily export from another system, either
  `ProjReport_D_M_YYYY.xml` (Microsoft "SpreadsheetML 2003" format — an XML
  dialect, *not* a real `.xlsx`) or a real `.xlsx`/`.xls` with the same two
  sheet names and columns. The app sniffs the first bytes (`PK` → zip →
  xlsx, `D0 CF 11` → legacy xls, otherwise treated as SpreadsheetML text) and
  picks a parser accordingly. The XML path is a **hand-rolled streaming
  parser** (`findWorksheets` / `parseRow` / `nextRow`, section 4 of the
  script) — deliberately not `DOMParser`, because the real files are tens of
  MB and building a full DOM for them was measured to be too slow. It yields
  to the event loop every ~24ms (`performance.now()` budget in `step()`) so
  the tab doesn't freeze on a 30+ MB file.
- **Column contract** (`COLS`, section 1): a fixed list of 11 columns,
  matched **by header text, never by position**. If any expected header is
  missing from a sheet, the whole file is rejected with a `MISSING_COLS`
  error naming the sheet and the missing headers. This "fail loudly, matched
  by name" philosophy is the single most important convention in this
  codebase and the Export Plan module follows it too.
- **Two sheets**: `"Open Projects Report"` and `"Closed Projects Report"`
  (`SHEET_ORDER`), shown as a segmented toggle in the header.
- **State + render**: one global `state` object (filters, sort, active
  sheet, filtered rows) and one `render()` that recomputes everything
  top-to-bottom (KPIs → chips → timeline → ranked panels → status chart →
  table). Filtering (`recompute()`) is a single pass that also derives
  cross-filtered facet counts (a value's count reflects every *other* active
  filter, not itself — that's the "fails <= 1" trick in `recompute`).
- **Table virtualization**: the bottom table (`paintRows`) is a manually
  windowed grid — `position:absolute` rows inside a tall spacer div, only
  the visible slice + overscan is rendered on scroll. Fine for a flat,
  uniform-height table; Export Plan's grouped cards have variable height, so
  it uses simple "Show more" pagination instead (see §5).
- **"Remember the last file"**, two layers:
  1. **Folder auto-load** (desktop Chrome/Edge only, `showDirectoryPicker`):
     the user grants access to a fixed network folder once; the handle is
     persisted in IndexedDB (`aitech-report` DB, `handles` store, key
     `"dailyFolder"`) and re-used on later visits (subject to the browser
     re-confirming permission). The app then picks the newest
     `ProjReport_D_M_YYYY.xml` in that folder itself, skipping any filename
     containing "india".
  2. **Cached file fallback** (works everywhere, including iPhone Safari,
     which has no File System Access API): every successfully loaded file
     is stored as a `File`/`Blob` in IndexedDB (`aitech-report` DB, `files`
     store, key `"lastFile"`). On boot, if the folder path didn't already
     load something, the cached file is restored and a toast tells the user
     it's showing a saved copy.
- **Responsive design**: almost entirely class-based CSS (`@media
  (max-width:640px)`), not separate markup — the same `.kpis`, `.filters`,
  `.rt` etc. elements just re-flow. The one JS/CSS bridge is the
  `--headerH` custom property, kept in sync with the sticky header's real
  height via a `ResizeObserver` (`syncHeaderHeight`), and used by the mobile
  filter drawer to size itself under the header. This detail mattered for
  Export Plan — see §4.

## 2. The two sample files and what they actually are

Two workbooks were provided during development:

- **`06 Export Plan_Origin.xlsx`** — the file that gets uploaded to the
  site. This is the real export, with every column the source system
  produces.
- **`06 Export Plan_Final.xlsx`** — *not* a second upload format. It is the
  same workbook with the "JUNE 26" (current month) sheet's columns trimmed
  down to the ones the user actually cares about looking at
  (`Project #`, `Project #/ Name`, `P/N`, `Qty.`, `Ship Date`,
  `Value in US$`, `Remarks`, `Tech.`). The other three sheets (`Done`,
  `OPEN ISSUE WITH R&D`, `Old`) were left with their full original column
  set in both files. In other words, "Final" is a spec of *which columns
  matter*, not a second file format the app needs to parse.

Conclusion baked into the parser: **only one upload format exists** (the
Origin layout), and the column contract should be a superset covering every
field seen across all four sheets, matched by header name — exactly the
`COLS`-by-name philosophy from the Project Report module, just applied to a
richer, per-sheet-varying schema (see §4.1).

Both sample files live nowhere in the repo (they were only attached to the
conversation) — if you need to re-test against them, ask the user to
re-attach them.

## 3. Two pages, one shell — the page switcher

**Requirement** (v1): on mobile, tapping the "Project Report" title
switches to Export Plan; on desktop, a separate button for the other type
sits next to the title.

**v1 design** (superseded, see below): a standalone, always-visible dark
bar above everything (`.pagebar`), sitting outside both page containers.
It worked, but it sat *inset* within `.app`'s own side padding (28px)
instead of bleeding to the viewport edge the way the real header does
(`header.top{margin:0 -28px}`) — visually it read as a strip narrower than
the rest of the page, which came across as "the whole site got narrower."
Removed.

**Current design**: no standalone bar at all. The switcher lives in two
places instead:

1. **Inside each page's own header**, directly under the brand title (one
   row below it), exactly matching "next to the existing title, a row
   down": `.brand` became a `flex-direction:column` block — first row is
   the existing `<b>title</b><span>Aitech</span>`, second row is a small
   pill button (`.switchpage`) naming the *other* page. Clicking the brand
   `<b>` itself also switches (kept from v1, works on any viewport, not
   just mobile — harmless extra affordance now that there's no
   desktop/mobile split to maintain).
2. **On the empty drop screen** (`.switchhint`, small muted text + a
   `.switchpage` pill, under the privacy note): the header is `hidden`
   until a file loads (original, deliberate design — the empty state is
   meant to be bare), which means the header-based switcher from (1) is
   invisible on a first visit. Without a second entry point, a first-time
   user would have **no way to reach the other page at all** — a real
   dead end, found while testing this exact change. The drop-screen hint
   fixes that, without reintroducing a standalone bar (it's inside the
   existing centered dropzone card, so it doesn't change the page's width
   or add a new full-bleed element).

```html
<div class="app">
  <div id="page-report" class="page" data-page="report">  <!-- existing markup, untouched, just wrapped -->
    <header id="top" hidden>
      <div class="brand">
        <div class="brandline"><b id="reportBrandTitle">Project Report</b><span>Aitech</span></div>
        <button class="switchpage" id="switchToExportBtn">Export Plan</button>
      </div>
      ...
    </header>
    <section class="dropscreen">
      ...
      <div class="switchhint">Looking for the Export Plan instead? <button class="switchpage" id="switchToExportBtn2">Switch</button></div>
    </section>
  </div>
  <div id="page-export" class="page" data-page="export" hidden> ... mirrored ... </div>
</div>
```

The router script (still the same small, self-contained `<script>` block
right after the pasted SheetJS library) just wires four click targets per
direction (`reportBrandTitle` + `switchToExportBtn` + `switchToExportBtn2`
→ export; the export-page mirrors → report) to the same
`go(other(current()))`, and toggles which page container is visible.

The last-used page is remembered in `localStorage["aitech.activePage"]` so
a reload reopens the same page. This wasn't explicitly requested but was a
one-line addition matching the general "remember where I left off" theme,
and it makes switching feel instant since both pages restore their own
cached file in the background regardless of which one is currently shown
(see §6) — flip to the other page and its dashboard is often already there.

### Two things that needed care to avoid cross-page bugs

1. **`--headerH` CSS variable collision.** The mobile filter drawer's sticky
   offset and max-height both read a custom property
   (`.filters{top:var(--headerH,56px)}`) that Project Report's own script
   sets on `documentElement` from its header's real height. If Export Plan
   reused the same variable name, whichever page's `ResizeObserver` fired
   *last* would clobber it for both — including setting it to effectively 0
   when the *other* page's header is `display:none`. Fix: Export Plan uses
   its own variable, `--epHeaderH`, wired through a more specific selector
   (`#page-export .filters{ top:var(--epHeaderH,56px) }`) that overrides the
   generic `.filters` rule only inside its own container. Zero shared state,
   zero edits to the original module.

2. **The global window `drop` handler.** The Project Report module has:
   ```js
   window.addEventListener("drop", function(e){ ...; handleFile(f); });
   ```
   registered unconditionally, in the bubble phase. If you're on the Export
   Plan page and drop a file *anywhere* on the page, this existing listener
   would still fire and silently feed your file into the (hidden) Project
   Report page's state — very confusing to debug later. Rather than touch
   that listener, Export Plan adds its own `drop` listener on `window` in
   the **capture phase** (`addEventListener("drop", fn, true)`), guarded by
   "is the export page currently the active one". Capture fires before
   bubble, so when it applies it calls `stopPropagation()` and the original
   bubble-phase handler never runs. When Project Report is active, the guard
   is false and behavior is 100% as before. `epDropzone`'s own drop handler
   also calls `stopPropagation()` for the same reason (so a drop that lands
   exactly on the dropzone doesn't double-fire).

## 4. Export Plan: parsing engine

Lives in its own IIFE, after the router script. Deliberately duplicates a
handful of small pure helpers from the Project Report module (`esc`,
`clean`, `toNumber`, `money`, `fmtDate`, Excel-serial date math, entity
decoding) rather than hoisting them into shared scope. The alternative would
have meant editing the working module to expose internals — duplication of
~40 lines of pure functions was judged the lower-risk trade given the
explicit instruction not to disturb what already works.

### 4.1 Column contract, by name, with a documented positional fallback

`FIELD_ALIASES` maps 14 canonical field keys (`priority`, `type`,
`projectNo`, `projectName`, `pn`, `qty`, `shipDate`, `value`, `license`,
`notes1`, `deliveryRisks`, `remarks`, `tech`, `oven`) to the header-text
variants seen in the real file (normalized: newlines → space, collapsed
whitespace, lower-cased). `findHeaderMap(aoa)` scans a sheet's first 12 rows
for one containing at least 4 recognized headers including both a P/N-like
and a project-like column, and uses that as the header row.

Two sheets in the real workbook have **no header row at all** — the person
maintaining the spreadsheet apparently deleted it at some point, but left
the data in the exact same column order as a sibling sheet that does have
headers:

- `"Old"` (the multi-year archive, thousands of rows) — same 11-column order
  as the `"Done"` sheet (`FALLBACK_DONE`): Priority, Type, Project #,
  Project Name, P/N, Qty, Ship Date, Value, License, Notes1, Delivery
  Risks/Notes 2.
- `"OPEN ISSUE WITH R&D"` — same 14-column full order as the current-month
  sheet (`FALLBACK_FULL`), detected generically: if a sheet has no header
  row but its first populated row has ≥8 leading cells filled, assume the
  full order.

This was verified by hand against the real file (see the git history / the
conversation this file came from) — the column *meaning* at each position
matches perfectly (e.g. column 9 always holds `"N/A"`/`"NA"`/blank, which is
exactly what "Exp. License Status" looks like). It is a narrow, named
exception, in the same spirit as the Project Report module's own
special-casing (the "India" filename exclusion, the `ProjReport_D_M_YYYY`
regex) — a documented quirk of one real file, not a general rule. If a
future export ever adds a header row to "Old", `findHeaderMap` will find it
first and the fallback path simply won't trigger.

**Only the current sheet is parsed** (August 2026 redesign — see §5). Sheet
names are sorted, by name alone, *before* any parsing happens: whatever name
*isn't* one of the three fixed names (`done`, `open issue with r&d`, `old`,
case-insensitive) sorts first and is treated as "the current one". Only that
one sheet is then passed to `parseSheet`. This means the app needs no
hardcoded knowledge of "JUNE 26" — next month's "JULY 26" sheet is picked up
automatically — and, as a side effect, the `"Old"` archive (~2,600 rows) and
the other two fixed sheets are never parsed at all, since nothing in the UI
shows them anymore. A sheet that has neither a header nor a wide-enough
first row throws `NO_SHEETS`; there is no multi-sheet fallback to try
because there is no second sheet in play.

### 4.2 The P/N ↔ Qty. line-pairing rule

This was the central ask: a cell in the `P/N` column can hold several
newline-separated part numbers, and the *n*-th line in the sibling `Qty.`
cell belongs to the *n*-th P/N line **of that same row** — never to a
different row, and never exploded into independent top-level rows.

`buildRecord()` splits both cells on `\n`, trims each line, and zips them:

- **Equal line counts** → clean 1:1 pairing (the common case, e.g. row 24
  in the sample: 3 P/Ns ↔ `10`, `10`, `15`).
- **Qty has exactly 1 line, P/N has several** → best-effort: that single
  quantity is applied to every P/N, flagged as a mismatch (shown in the
  quality bar, and the card gets a gold left-border) so it's visible rather
  than silently guessed.
- **Anything else that doesn't line up** → every P/N line is still kept (a
  P/N is *never* invented or dropped), quantities are paired positionally as
  far as they go and `null` (rendered as "—") beyond that, and the row is
  flagged as a mismatch. The principle: an honest "—" beats a confidently
  wrong number silently attached to the wrong part.

All other fields on that row — Ship Date, Value, Remarks, Priority, etc. —
belong to the **whole row**, not to an individual P/N, and are stored once
per record (this matches the sample data exactly: row 24's single value of
$55,542/$160,715 in the two sample files covers all three P/Ns together).

`Tech.` (and any future multi-line field that *isn't* P/N or Qty) is split
into a plain list and shown as-is — deliberately **not** zipped with
anything, since it isn't positionally paired with P/N in the source (e.g. a
row can have one P/N but three technician names on separate lines).

### 4.3 A real bug found while testing: legend rows disguised as data

While testing against the actual sample file, the "Top projects by value"
panel showed a phantom `(Blank)` project worth **$7.16M** — clearly wrong.
Tracing it back: row 44 of the "JUNE 26" sheet is not a data row at all, it
is a **stray caption** living inside the data range —
`Project Name = "Risk, with possible delays"`, `P/N = "Ready for shipment"`,
`Value = 7162150` — almost certainly a legend explaining a colour-coding
scheme used elsewhere in the workbook, with a leftover total figure in the
same row by coincidence of column position. A near-identical row exists at
row 45 (`"C=Commercial, D=Defense (Exp. Lic. Req.)"`) and one in the "Done"
sheet (row 17). All three share one trait every *genuine* row does not:
**an empty `Project #` cell.**

The original skip condition was "skip the row only if Project #, Project
Name, and P/N are *all* empty" — too lenient, since these caption rows do
populate the Name/P·N-shaped cells. The fix, in `buildRecord()`:

```js
// Every genuine line carries a Project #. Rows without one are blank
// spacers or stray captions living in the data area — never real export
// lines — so skip them rather than showing a fake "(Blank)" project.
if (!projectNo) return null;
```

Verified against both sample files after the fix: the phantom row disappears,
KPI totals drop from the inflated $14.57M to the correct $7.41M (Origin) and
totals line up with hand-checked sums from a Python read of the same sheet.
This is the kind of "don't let the site make a mess of the data" failure
mode the user explicitly worried about — worth remembering if a future
export ever adds *another* kind of stray annotation row: the litmus test
used here is "does it have a real Project #", and that held for every
genuine line in both sample files.

### 4.4 Data model

Each parsed row becomes one **record**:

```
{
  _sheet, _row,                                   // provenance
  priority, type, projectNo, projectName,
  items: [{ pn, qty }],                            // paired P/N + Qty lines
  _qtyMismatch,                                    // true if pairing was best-effort
  shipDate (ms|null), _noDate,
  value (number), _badValue,
  license, notes1, deliveryRisks,
  remarks, techLines: [string], oven
}
```

Nothing from the sheet is discarded: every canonical field that has a value
somewhere in the UI (KPI totals, filters, ranked panels, or the card itself)
— see §5.

## 5. Export Plan: the UI

### 5.1 Why cards instead of a flat table

The Project Report module's bottom table is a flat, uniform grid: one row
per record, `position:absolute` virtualization keyed off a constant
`ROW_H`. Export Plan's records don't have a uniform shape — some have one
P/N, some have several — so a flat table would either (a) explode multi-P/N
rows into several visually-independent table rows sharing a date/value,
which is exactly what was asked *not* to happen, or (b) need `rowspan`-like
merging, which CSS grid doesn't do cleanly and which breaks click-to-sort /
click-to-filter row semantics.

Instead each record renders as one **card** (`renderCard`):
- **Single P/N** (the common case — most rows): P/N and Qty are shown
  *inline* in the header line, so it visually reads like a normal row.
- **Multiple P/Ns**: the header line shows only the shared fields
  (Project #, Name, Ship Date, Value), and a small nested list underneath
  shows each P/N + Qty pair, visually distinguished (bullet + indent) but
  still clearly part of the same card/row.
- A `.mismatch` class (gold left border) marks the (rare) best-effort
  pairings from §4.2.
- Every other populated field — Priority, Type, License, Oven, Tech,
  Remarks, Notes, Delivery risk — is rendered as a chip or a labelled line,
  but only if it has a value, so a mostly-empty row doesn't get cluttered
  with empty labels.

Given the size of some sheets (the "Old" archive currently has ~2,600
records), the list uses simple **"Show more" pagination** (150 at a time)
rather than scroll-virtualization — variable card heights make the
position-absolute windowing trick used by Project Report's flat table
impractical, and 150 cards is cheap enough to paint directly. Filtering
resets the visible count back to 150.

Default sort is by ship date, ascending, nulls last — there's no
column-header sort UI (that concept doesn't really apply to a card layout).

### 5.2 August 2026 redesign: no filters, no sheet tabs, a pie instead of ranked panels

The user asked for a full visual redo of this page, on the premise that only
one worksheet in the workbook is ever actually looked at (the current-month
sheet — "Done" / "OPEN ISSUE WITH R&D" / "Old" are noise for this view) and
that this sheet doesn't need the filter UI Project Report has. Concretely,
compared to the original v1 design described above (still accurate for
Project Report, and for §5.1's card layout here):

- **The sheet-switcher segmented control (`epSheetToggle`) is gone**, along
  with the multi-sheet parsing that fed it — see §4.1's "Only the current
  sheet is parsed". The header now holds just the brand/switch-page row and,
  right-aligned, "Load another file" + the loaded filename/sheet/row-count
  (`epFilemeta`).
- **The filter bar (`epFiltersSection`, `.cb`/`.pop`/`.opt` combobox fields,
  chips, mobile filter drawer) is gone entirely** — `FILTER_COLS`,
  `facetValues`, `recordMatches`, `state.filters`, `state.period` and
  everything that fed them were deleted. `state.filtered` is now just
  `activeSheet().rows`, sorted by ship date — there is no filtering step.
- **The KPI band (`#epKpis`) is `position:sticky`**, pinned directly under
  the sticky header (`top:var(--epHeaderH)`) so it's always visible while
  scrolling the list below — this is the "parameters row" the request asked
  to keep, just anchored. The quality bar (rows without a date/P·N, credit
  rows, mismatched pairings) that used to sit under it was removed along
  with everything else below the KPI rule, per the request.
- **The timeline chart and the two ranked panels (`renderTimeline`,
  `renderByProject`/`renderByPN` in the original design) are replaced by a
  pie/donut breakdown** (`renderPie`, `#epPieChart`) with a **P/N ↔ Project**
  toggle (`#epPieToggle`) above it, sized by summed quantity — `groupByPN`
  and `groupByProject` are reused from the old ranked-panel code (their sort
  order changed from by-value to by-qty, since qty is now the only thing
  either mode encodes). The pie shows the top 7 groups as fixed, ordered
  categorical hues (`--series-1`..`--series-7` in `:root` — see
  `dataviz` skill's color-formula for why the order is fixed and not
  generated) plus an eighth "N more" slice in neutral `--slate` for the
  remainder — an all-pairs adjacency read (any two pie slices can be
  neighbours) doesn't cleanly clear CVD separation past 3 hues, so the cap
  at 7 + Other, with direct-label relief (the legend's text labels + the
  item list beside it), is the documented trade-off for going past that.
  `annularPath`/`polar` are small hand-rolled SVG donut-arc helpers, in the
  same "no charting library, hand-rolled SVG" style as Project Report's own
  timeline (which this replaces).
- **Beside the pie, at the same height** (`.eppie-grid`, `--eppie-h`), a
  plain scrollable list (`renderPieList` → `flattenItems`) shows every
  line item — one row per P/N (or one row for a record with none) — as
  **Project / P/N / Qty / Value in US$**, in the sheet's own row order
  (see §5.3), always reflecting the whole sheet regardless of which pie
  mode is active (this list doesn't change when you toggle P/N ↔ Project;
  only the pie does).
- The full card list (§5.1) is unchanged and still sits below a rule, at
  the bottom of the page, exactly as before — only what used to be *above*
  it (the original filters, timeline, ranked panels) changed. (A different
  filter bar came back above it in the §5.3 follow-up — read on.)
- Card click-to-filter (`setOnly("projectNo", …)` on card click) was removed
  along with the filter system it depended on; cards are no longer
  clickable, just `role="article"`.

One CSS gotcha hit while building this: the pie's P/N/Project toggle reuses
the site's `.segmented` pill-button styling for visual consistency with the
header's old sheet-toggle. But `.segmented{order:3}` inside the shared
`@media (max-width:640px)` block (written for reordering the *header's*
segmented control among flex-wrapped siblings) also matched this new
`.segmented`, and — since `.eppie-chart-col` is itself a `flex-direction:
column` box — silently reordered the toggle to *after* the chart on phones.
Fixed with a same-specificity `.eppie-toggle{order:0}` declared later in the
stylesheet, which wins the cascade tie unconditionally rather than only
inside that one media query. Worth remembering if another `.segmented`
instance gets added somewhere flex-column'd: that mobile `order:3` rule is
easy to forget is there.

### 5.3 Same-day follow-up: no legend, hover-linked list, bigger pie, filters are back (for the table only)

A second round of feedback on §5.2, addressed the same day:

- **The separate pie legend (`renderPieLegend`, `#epPieLegend`, `.epleg-*`)
  is gone** — the request was explicit that the item list *is* the legend,
  so a second list-shaped thing under the donut was redundant. The pie's
  `<title>` per `<path>` still carries the full label for anyone who wants
  it (screen readers, a slow native tooltip), but the primary way to read a
  slice is now interaction, not a static key.
- **Hover (or keyboard focus) on a slice now does two things**
  (`renderPieChart` → `wirePieHover`): the donut's center label swaps from
  the sheet total to that slice's own qty + share (two `<text>` nodes,
  `#epPieCenterVal`/`#epPieCenterLab`, textContent-swapped, not
  re-rendered), and every matching row in `#epPieList` gets a `.hl`
  highlight (`data-project`/`data-pn` attributes written per row in
  `renderPieList`, matched against the slice's `key` — or, for the "N
  more" slice, against its `otherKeys` array, so hovering "Other" lights
  up every folded-in row at once). The first matched row also gets
  `scrollIntoView({block:"nearest", behavior:"smooth"})`, since the row
  proving the highlight actually works is often scrolled out of view in a
  ~380px-tall list. `mouseenter`/`mouseleave` and `focus`/`blur` share the
  same two handlers, so tabbing through the slices (each has
  `tabindex="0"`) gets the identical effect for keyboard users.
- **The pie is bigger**: 268px/rOuter 126/rInner 60, up from 232/108/54 —
  there was headroom to spend once the legend (which used to compete for
  the same column height) was removed. `--eppie-h` (the shared column
  height both sides match) actually came *down*, from 440px to 380px
  desktop, since a lone toggle + donut needs less vertical room than
  toggle + donut + a potentially-long legend did.
- **The item list is now in the sheet's own row order**, not the
  ship-date-ascending order used elsewhere. `renderPie()` reads straight
  from `activeSheet().rows` (the parser's natural, unsorted order — see
  §4's "Only the current sheet is parsed") instead of `state.filtered`;
  `state.filtered` is now exclusively the bottom table's business (next
  bullet). Sort order for the pie's own aggregation doesn't matter (it's
  summed into groups either way), only the list's display order does.
- **A filter bar is back — scoped to the bottom (full) table only.** This
  is close to a straight revival of §5.2's deleted `renderFilterBar`/
  `wireCombo`/`FILTER_COLS`/`facetValues`/`recordMatches` (same 7 columns,
  same combobox component), renamed with an `epCard`-prefix
  (`renderCardFilterBar`, `wireCardCombo`, `toggleFilter`,
  `renderCardChips`, `#epCardFiltersSection`) and moved to sit directly
  above `.tablewrap` instead of at the top of the page. Crucially,
  `state.filters`/`state.filtered` now mean "the bottom table's filters" —
  the KPI band reads `state.filtered` too (so "X of Y" is meaningful again
  when a filter is active), but the pie and its item list deliberately do
  **not** — they read `activeSheet().rows` directly (previous bullet), so
  filtering the table never changes what the pie shows. This was a
  conscious split, not an oversight: the request asked for filters on "the
  bottom table", not the summary section above it.
- **CSS gotcha #2**: `.filters` (shared with Project Report and with the
  original §5.2 filters this reuses) has a `@media (max-width:640px)` rule
  that makes it `position:sticky; top:var(--headerH/--epHeaderH)` — correct
  when `.filters` is the page's first content row, wrong here since this
  instance sits mid-page. Fixed with an ID-scoped override,
  `#epCardFiltersSection{position:relative; top:auto; margin-top:16px}`
  inside the same media query (ID beats class, and it's declared after the
  generic rule, so it wins outright rather than needing `!important`). It
  still needs `position:relative` (not `static`) on mobile, though, because
  `.fpanel`'s mobile dropdown is `position:absolute` and anchors to the
  nearest positioned ancestor — dropping position entirely would let the
  dropdown escape to whatever ancestor *is* positioned and mis-place it.

### 5.4 Third round: direct labels, hover vs. click split, per-project colors, merged value cells

A third round of feedback the same day, on the pie + list from §5.2/§5.3:

- **Every slice is now direct-labelled**, not just tooltip-on-hover: a thin
  leader line (outer edge → a short radial step → a horizontal stub) ends
  at the slice's key, truncated to 13 chars with `truncateLabel`. This is
  why the SVG's own coordinate space grew to a 520×400 `viewBox` (`cx=260,
  cy=200, rOuter=118, rInner=56`) even though the *rendered* pie itself is
  about the same size as before — the extra canvas is label margin on every
  side, since a slice can sit anywhere around the circle. The `<svg>` has
  no `width`/`height` attributes anymore, only the viewBox — CSS
  (`.eppie-chart svg{width:100%; max-width:480px; height:auto}`) scales it
  to fit the column while keeping the label margins proportional at every
  size, which is also what makes the mobile shrink
  (`max-width:340px` at 640px) a one-line CSS change instead of a second
  hand-computed geometry.
- **Hover and click now do different things**, on request — previously
  hover drove the list highlight, which the user found the wrong trigger:
  - **Hover (or keyboard focus)** only *previews*: the slice's path `d` is
    regenerated with `rOuter + PIE_HOVER_GROW` (9px) — geometry, not a CSS
    `transform: scale()`, because scaling an annular sector from the donut
    center moves the *inner* edge too and dents the hole; regenerating the
    path keeps `rInner` fixed and only the outer edge moves. The center
    label swaps to the hovered slice's qty/share for the duration of the
    hover, unless a slice is picked (next bullet) — then hovering a
    *different* slice still previews it, but releasing the hover reverts to
    the *picked* slice's label, not the total.
  - **Click "picks" a slice** (toggles — clicking the same slice again
    un-picks it, clicking a different one moves the pick). Picking is what
    drives `highlightPieListSlice()` — the `.hl` class on matching
    `#epPieList .epsl-cell` elements, and the `scrollIntoView` of the first
    match — and adds a `.picked` class to the path (`stroke:var(--ink);
    stroke-width:3px`) as the persistent "this one's selected" indicator.
    Keyboard users get the same toggle via Enter/Space (`keydown` on each
    `tabindex="0"` path).
  - The stray rectangle the user saw on click was the browser's default
    SVG focus outline (`outline: 2px solid var(--gold)` on
    `:focus-visible` in the previous round) — `outline` on an SVG path
    always draws the element's *bounding box*, not the path shape, which
    reads as a random square over a donut wedge. Removed outright
    (`.eppie-chart path{outline:none}`); the `.picked` stroke (which does
    follow the wedge's actual shape) is the only "this is the selected
    one" affordance now.
- **Every row in the item list gets a per-project color swatch**
  (`buildProjectColorMap`, a small `<i class="epsl-swatch">` before the
  Project text), ranked and colored the same way `groupByProject` ranks
  for the pie (by qty desc, `SERIES_COLORS[i % 7]`) — so two rows sharing
  a project always share a color, and a project with only one P/N line
  still gets its own color, not gray. This is independent of the pie's
  current mode: in P/N mode the pie's own slice colors encode *P/N*
  identity while the list's swatches simultaneously encode *project*
  identity — two different color systems on screen at once by design,
  since they answer different questions.
- **Rows sharing a project get one merged Value cell**, not a repeated
  figure — requested separately, mid-round, after seeing the same dollar
  amount printed on every P/N line of a multi-P/N project. "Same project"
  here means *consecutive* rows only (never rows reordered from elsewhere
  in the list) — in practice this is exactly one source record's several
  P/N lines, which is the only case where the value is genuinely identical
  by the data model (§4.2: value belongs to the whole row, not a P/N).
  Implementing a real spanning cell forced a structural change:
  `#epPieList` used to be one flex column of `.epsl-row` divs, each its
  own 4-column grid; it's now a *single* CSS grid
  (`.eppie-listscroll{display:grid; grid-template-columns:1.1fr 1.3fr .7fr
  .9fr}`) and `renderPieList` emits flat `.epsl-cell` spans with an
  explicit `grid-row` (and an implicit `grid-column` from each cell's own
  class, `.epsl-proj{grid-column:1}` etc.) instead of row wrapper divs.
  For a group of *N* consecutive same-project rows, the Project/P·N/Qty
  cells still render N times (one per row), but the Value cell renders
  **once**, positioned `grid-row: <start> / span N` — a genuine merged
  cell (vertically centered by the cell's own `align-items:center`), not
  N repeated numbers or a rowspan-look-alike. It also carries every
  member P/N in its `data-pn`, `|`-joined (`groupPns`), so that clicking a
  P/N slice for *any* one of the group's P/Ns still correctly highlights
  the shared Value cell along with that specific P/N's own row. A
  `.merged` class adds a `border-left` "bracket" as a visible cue that the
  figure spans more than one row. Explicit `grid-row`/`grid-column` on
  every cell (rather than leaning on CSS Grid's auto-placement to skip
  around the spanned cell) was a deliberate choice to keep this
  deterministic — auto-placement interacting with an explicit span is
  usually fine but not worth the risk of a subtle browser-version-specific
  misplacement in hand-verified code with no test framework.

### 5.5 Fourth round: no cap on slices, a much bigger pie, framed/linked groups

- **The Top-7 + "N more" cap is gone.** The user's objection wasn't to the
  cap as such but to the bucket having no identity ("it's supposed to be a
  project or a P/N") — so `pieSlices()` now returns one slice per distinct
  group, full stop, no `PIE_TOP_N`/`PIE_OTHER_COLOR`/`isOther`/`otherKeys`.
  Colors still cycle the 7-slot palette past 7 groups
  (`SERIES_COLORS[i % 7]`) — same scheme `buildProjectColorMap` already
  used for the list's swatches, so a real dataset with, say, 17 distinct
  P/Ns just repeats hues past the 7th rather than graying anything out.
  Removing the cap immediately surfaced a labeling problem: many small
  slices clustered on one side of the donut produced overlapping label
  text. Fixed with a small decluttering pass in `renderPieChart` — collect
  every label's natural position, split into the right half/left half (by
  `dir = cos(am) >= 0`), sort each half top-to-bottom by y, and push any
  label down that's within 13px of the one above it in its half. The
  leader line gained a third point (an elbow at the *original* x, *nudged*
  y) so it still visually starts from the slice and bends over to the
  final label position rather than pointing at a spot the label isn't
  at. This is a one-pass top-down push, not true force-directed layout —
  fine for the realistic slice counts here (tens, not hundreds), but a
  dataset with a great many same-side thin slices could still push labels
  past the canvas edge; nobody has hit that yet.
- **The pie is much bigger — by design, not by accident.** Two changes
  compound: the list column went from flexible-and-wide to a fixed
  `300px` (`.eppie-grid{grid-template-columns:300px 1fr}`, chart column
  now gets whatever's left, `1fr`), and the SVG's own `viewBox` shrank
  from a generously-margined 520×400 down to a tightly-measured 500×290
  (`cx=250, cy=145, rOuter=118` unchanged) — the earlier version left a
  lot of unused vertical canvas (only ~132 of the 200px half-height above/
  below center was ever reachable by a label), so tightening the margin
  to what labels actually need let the same `rOuter` render much larger
  once scaled up by CSS. `.eppie-chart svg{max-width:950px}` (from 480px)
  is what actually stretches it — on a typical desktop width the donut's
  rendered diameter roughly doubled. `--eppie-h` (the shared column
  height) grew to match (620px desktop, stepped down at the existing
  1180/900/640px breakpoints), and the 900px breakpoint's `max-width` also
  grew (700px) since the stacked single-column layout has the full page
  width to itself there.
- **Groups are visibly framed, and hovering marks the whole group** — a
  new `.epsl-frame` element (`border:1px solid var(--line-strong)`,
  `pointer-events:none` so it never steals the click/hover from the cells
  stacked on top of it) is emitted for every group of 2+ rows, positioned
  with the same `grid-row: start / span N` trick as the merged Value
  cell, but spanning `grid-column: 1/-1` (the whole row width) instead.
  Every cell belonging to a group (frame included) shares a `data-group`
  index, assigned sequentially in `renderPieList` (including groups of
  size 1, which just don't get a rendered frame element). Hover is wired
  generically over every `[data-group]` element post-render
  (`wireListInteractions`): entering any member adds `.grouphover` to
  every element sharing that index, in one query — this is what lets a
  1px-bordered, pointer-events-none frame still visually react, since its
  own class is toggled by its sibling cells' hover, not by hovering the
  frame itself (which wouldn't receive the event anyway).
- **Clicking a list row now picks the matching pie slice — the reverse of
  the existing pie→list link.** This forced the pie's pick/hover state out
  of `renderPieChart`'s local closures and into a module-level `pieState`
  object (`slices`, `total`, `mode`, `pickedIdx`, `geom`, plus cached
  `svg`/`centerVal`/`centerLab` refs) with free functions
  (`pieShowTotal`, `pieShowSlice`, `pieSetGrown`, `pieTogglePick`,
  `pieFindSliceIndex`) operating on it — both the pie's own path-click
  handler and the list's cell-click handler now call the same
  `pieTogglePick(idx)`, so there's exactly one place that owns "what's
  currently picked" regardless of which side triggered it. A list click
  resolves its target slice by `pieState.mode`: the clicked cell's
  `data-project` in Project mode, or the *first* `|`-joined P/N in
  `data-pn` in P/N mode (a merged Value cell or a Project cell in a
  multi-P/N group carries several P/Ns — clicking picks a specific one
  rather than being a no-op).
- **The donut's center label now also shows the picked/hovered slice's
  money total**, not just qty and share — `sliceMoneyTotal(recs, mode,
  sl)` sums each *matching record's* `value` once (not once per P/N line,
  so a 3-P/N record matching a Project slice — or matching one of its own
  P/Ns in P/N mode — still only contributes its value a single time).
  Requested after the user picked a multi-row project slice and only
  wanted to see one row highlighted plus a total — the highlighting itself
  was already correct (every cell whose `data-project`/`data-pn` matches
  lights up, which for a 3-row project group is 9 cells + the merged
  Value cell = 10), so the real gap was the missing money figure, now
  `pct% · $total` on the label's second line.

### 5.6 Fifth round: the pie had gotten too big — walked back to ~40%, on-demand labels, a draggable split

Round four over-corrected — the user came back saying the pie was now
"huge," eating ~80% of the screen, and asked for roughly a 40/60 chart/list
split instead, no always-on labels, and a way to *adjust* that split
themselves rather than have it hardcoded either way:

- **`.eppie-grid` changed from CSS grid to flexbox**, specifically so the
  split can be dragged. `.eppie-list-col` is `flex:0 0 auto; width:60%`
  (not `flex:0 0 60%` — the `flex` shorthand sets `flex-basis`, and
  `flex-basis` wins over `width` on the main axis whenever it isn't
  `auto`, which would have silently ignored any `width` the drag handler
  set later; `flex-basis:auto` is what makes `width` the effective sizing
  property) and `.eppie-chart-col` is `flex:1 1 auto` — it simply gets
  whatever's left, so the two always sum to the full row width by
  construction.
- **The pie itself shrank** — not by changing the SVG's internal geometry
  (`cx/cy/rOuter/rInner` and the tightened 500×290 viewBox from §5.5 are
  untouched) but by pulling the CSS clamp way back down,
  `.eppie-chart svg{max-width:420px}` (from 950px). Combined with the list
  column now defaulting to 60% instead of a fixed 300px, the rendered
  chart column is close to the requested ~40% share on typical widths.
- **A drag handle between the two panes** (`#epPieResizer`, a 13px
  `cursor:col-resize` strip with a thin centered line) lets the user move
  that split themselves — `wireEppieResizer()` tracks `mousedown`/
  `mousemove`/`mouseup` (and the touch equivalents) on it, computes the
  list pane's new width from the drag delta, and clamps it between 220px
  and 78% of the row so neither pane can be squeezed to nothing. Left/
  Right arrow keys nudge it by 28px when the handle has focus
  (`role="separator" tabindex="0"`) for keyboard users. Hidden below the
  900px breakpoint (`.eppie-resizer{display:none}`), where the panes
  stack vertically instead of sitting side by side — dragging a
  horizontal split doesn't mean anything once they're stacked, and the
  list pane's width is force-reset there (`width:auto !important` — a
  deliberate, narrow use of `!important`, needed because the drag handler
  may have left a JS-set inline `width` from a wider viewport, which
  otherwise beats any non-`!important` stylesheet rule regardless of
  selector specificity).
- **Slice labels no longer show at rest.** Every `.epslice-label` starts
  `opacity:0` (`transition:opacity .1s`); a `.show` class — toggled by
  `pieSetLabelVisible(idx, visible)` — is the only thing that reveals one.
  That function is called from the exact same places that already existed
  for the grow/pick effects (§5.4/§5.5), so no new interaction model was
  needed: hovering/focusing a slice shows its label (`preview()`) and
  hides it again on leave *unless* that slice is the picked one
  (`unpreview()` checks `idx !== pieState.pickedIdx` before hiding);
  picking a slice shows its label and keeps it shown until it's un-picked
  or another slice is picked (`pieTogglePick`, which now also calls
  `pieSetLabelVisible` on both the outgoing and incoming index). Net
  effect: at most two labels are ever visible at once — the picked one (if
  any) and whatever's currently under the pointer — so the donut reads
  clean by default and the earlier decluttering pass (§5.5) rarely even
  gets exercised now that labels aren't all on-screen simultaneously.

### 5.7 Sixth round: the pie was still too small for the space it had, labels move below it, group clicks fixed

The §5.6 walk-back overshot in the other direction: a screenshot showed a
donut sitting in the middle of a mostly-empty panel, because
`.eppie-chart svg{max-width:420px}` was an arbitrary cap that had nothing
to do with how much room the column actually had. This round removes the
cap entirely in favor of true fit-to-container sizing, moves the slice
name out of the leader-line system (gone) into a caption reserved below
the donut, and fixes two real bugs in the list's click behavior that
surfaced once someone was actually using it.

- **The donut now fills its box, full stop.** `.eppie-chart` and
  `.eppie-chart svg` are both `width:100%; height:100%` (no `max-width`
  anywhere, no per-breakpoint override) inside `.eppie-chartscroll`
  (`flex:1`, so it's exactly "whatever's left in the column after the
  toggle"). The SVG's own `viewBox` plus the default
  `preserveAspectRatio="xMidYMid meet"` (never set explicitly — it's the
  SVG spec default) does the "scale to fit both axes without distorting,
  centered" part for free; no JS measurement or resize-observer needed.
  Verified: `getBoundingClientRect()` on the svg and on
  `.eppie-chartscroll` return the *same* box.
- **Slice labels don't sit next to the wedge anymore — there's no leader
  line at all now.** The whole labelItems/decluttering/polyline system
  from §5.5 is deleted. Instead, a single `<text id="epPieCaption">` sits
  in a reserved band below the circle (`y = cy + rOuter + 30`, inside a
  viewBox — 260×280, `cx=130, cy=122, rOuter=104` — sized so that band
  exists at all). `pieShowSlice`/`pieShowTotal` (already the single place
  that updates the center qty/%/money text) now also write the caption —
  the slice's key on `pieShowSlice`, empty string on `pieShowTotal` — so
  hover-preview and pick already drove the caption for free once those
  two functions were extended; no separate show/hide wiring was needed
  this time (contrast with §5.6's `pieSetLabelVisible`, now deleted along
  with the labels it toggled). Freeing the viewBox from label margins is
  also *why* the geometry shrank from 500×290 to 260×280 — that's not a
  smaller donut, it's a tighter box around the same-shaped donut, which
  is what let removing the CSS max-width actually render bigger instead
  of just filling wasted margin.
- **Every group now gets a frame — including a group of one** — the
  `groupLen > 1` guard on emitting `.epsl-frame` is gone, so a lone P/N
  under a project gets exactly the same colored box as a 3-line group,
  just sized to one row. The frame's border/background color comes from
  a `--frame-color` custom property set inline per group (from
  `buildProjectColorMap`, same as the swatch dot already used) and
  consumed by shared CSS via `color-mix(in srgb, var(--frame-color) N%,
  white)` — this is what lets one set of hover/hl rules brighten *any*
  group's frame in *that group's own* color without per-instance CSS.
  `color-mix()` is a modern-Chromium-only feature; acceptable here since
  this whole app is verified against the pre-installed headless Chromium
  only (see §7), not a cross-browser target.
- **Two real bugs, both about what a list click actually marks.** The
  request was explicit: clicking inside a group should always mark the
  *whole* group, never a single row picked out of it — group size 1
  marks that one row (trivially, since the group *is* that row).
  Previously, `wireListInteractions`'s click handler resolved a cell to a
  single P/N or project key and called `pieTogglePick`, which (correctly)
  highlights every cell matching *that key* — fine in Project mode or for
  a size-1 group (the group and the slice are the same set of cells by
  construction), but wrong in P/N mode for a multi-P/N group: clicking
  one P/N line only lit up that one row + the shared Value cell, not the
  other P/N lines sitting right next to it in the same visibly-framed
  block. Root cause: a multi-P/N group in P/N mode doesn't correspond to
  any *single* pie slice — its P/Ns are separate slices — so there was
  never a "pick" call that could represent "the whole group" in that
  mode. Fixed with `highlightPieListGroup(host, groupId)`, a
  `data-group`-keyed sibling to the existing `data-project`/`data-pn`-
  keyed `highlightPieListSlice`: the click handler now checks
  `pieState.mode === "project" || groupRowCount(...) <= 1` — the
  unambiguous case, where a single pie slice really does represent the
  whole click target, so it still goes through `pieTogglePick` exactly as
  before (which happens to produce an identical highlight to the group
  path, since the two sets of matching cells are the same set in that
  case) — and falls back to `highlightPieListGroup` otherwise, clearing
  any unrelated pie pick first (`pieTogglePick(pieState.pickedIdx)` on
  the *current* picked index toggles it off) so the pie never shows a
  stale, unrelated selection next to a list group that has nothing to do
  with it.

### 5.8 Seventh round: adjacent-group colors, a Chart/Buttons view toggle, a real highlight bug

- **`buildProjectColorMap` now ranks by list order, not qty rank.** The
  user could see two neighboring framed groups in nearly the same color —
  root cause: colors were assigned by `groupByProject`'s qty-descending
  rank, a completely different ordering than the row order the list
  actually renders in, so two qty-adjacent (similarly-colored, since
  `SERIES_COLORS`' sequence was validated for *adjacent-slot* separation)
  projects could easily end up qty-close but sheet-adjacent by pure
  coincidence. Fixed by ranking on first-appearance order in
  `activeSheet().rows` instead — the same order groups are emitted in by
  `renderPieList` — so consecutive list neighbors always get consecutive
  palette slots, which is exactly the pairing the palette's own CVD
  validation covers. This deliberately makes the list's colors diverge
  from the pie's own (still qty-ranked) slice colors in Project mode,
  where they used to coincide — see the file for why that's an accepted,
  intentional trade (two color systems answering two different
  questions), not an oversight.
- **A real bug, found while building the above: `.epsl-frame` never
  carried `data-project`/`data-pn`.** `highlightPieListSlice` (driven by
  the pie itself — hovering/picking a wedge or a Buttons-view button)
  matches elements by those two attributes; the frame only ever had
  `data-group`, so it silently never matched and never got `.hl` from
  that path — only `highlightPieListGroup` (the list's own ambiguous-
  click fallback, §5.7) happened to hit it, via `data-group` alone. In
  other words: the "selection isn't clear enough" complaint was partly a
  real styling contrast issue (next bullet) and partly this — picking a
  slice from the *pie side* was leaving the frame's border/background
  exactly as it looked at rest, for every interaction path except the
  ambiguous list-click one. Fixed by giving the frame the same
  `data-project`/`data-pn="…"` (the group's `|`-joined P/Ns, same value
  the merged Value cell already carries) as its member cells.
- **The idle vs. selected contrast was also genuinely too subtle** even
  once the frame started participating — 6% vs 20% tint on the same
  `color-mix()` scale reads as "slightly more of the same," not "this is
  now selected." Pushed apart: idle stays put (border ~45% mix, fill 6%),
  `.hl` jumps to a 3px solid-color border, a much richer 38% fill, and an
  outer `box-shadow` ring (22% mix) — deliberately closer to "solid block"
  than "tint," so selected reads unambiguously at a glance. `.grouphover`
  (the transient hover-only state) sits at a deliberately lower 14%/12% so
  it stays visually distinct from the persistent `.hl` state — hovering
  and having-picked no longer look like the same thing at different
  opacities.
- **A second way to browse slices: a Chart/Buttons view toggle**
  (`#epPieViewToggle`, top-right of the chart column, sharing its header
  row with the existing P/N/Project toggle at top-left — "Chart" and
  "Buttons" were picked as the clearest plain-English names for "the
  donut" vs. "a grid of buttons, one per group"). Both views are always
  rendered (`renderPie()` calls both `renderPieChart` and the new
  `renderPieButtons` every time; `wirePieViewToggle` only ever toggles
  which one has the `hidden` attribute), so switching between them is
  instant and never loses the current pick. Buttons mode
  (`.eppie-buttons`, `grid-template-columns:repeat(5,1fr)`, 3 columns
  under the 640px breakpoint) is one button per slice, each colored via
  the same `--frame-color`-driven `color-mix()` pattern as the list's
  frames, scrolling if there are more than fit. A button click is always
  unambiguous — unlike a list-group click, one button is always exactly
  one slice — so it just calls the same `pieTogglePick` the chart's own
  wedges use. Keeping both visuals' "picked" look in sync needed
  `pieTogglePick` to stop reaching into `pieState.svg` directly and go
  through a new `pieSetPickedClass(idx, on)` that toggles the class on
  *both* the matching `<path>` (if the chart exists) and the matching
  `.eppie-btn` (if the button grid exists) — so picking a slice in one
  view and then switching to the other shows the same slice already
  marked picked, with no extra state to reconcile.

### 5.9 Eighth round: selection border matches the pie/buttons exactly, spacing between groups

Two follow-ups to §5.8's highlight fix, both quick:

- **`.epsl-frame.hl`'s border is now literally `var(--ink)`** (solid
  black), not the group's own `--frame-color` at a higher mix percentage.
  The request was explicit: match the same visual language already used
  for a picked pie wedge (`.eppie-chart path.picked{stroke:var(--ink);
  stroke-width:3px}`) and a picked Buttons-view button
  (`.eppie-btn.picked` — which, on reflection, *also* still used
  `border-color:var(--frame-color)`, so it got the same fix here for
  consistency, even though only the list's frame was called out by name).
  The color-mix'd fill underneath (`--frame-color` at 32%) stays, so the
  group's own identity color is still visible — only the *border*, the
  part that actually signals "selected," went to black. This reads as
  unambiguous regardless of the group's own hue, where a same-hue
  darker-tint border could still look like "idle, just a bit stronger" at
  a glance (which was the substance of the original complaint).
- **A visible gap between groups.** `.eppie-listscroll` is one continuous
  CSS grid (see §5.2/§5.3), so a uniform `row-gap` was not an option — it
  would have opened the same gap *inside* a multi-row group, between its
  own member rows, undoing the "one visual block" effect the frame exists
  to create. Instead, `renderPieList` now emits an explicit spacer
  element (`<span class="epsl-gap">`, `height:7px`, no color/border) into
  its own dedicated grid row between one group's last row and the next
  group's first — `gridRow` advances by one extra when there's a
  following group. Deliberately a real sized grid item and not an
  unreferenced row left to auto-collapse: an empty grid track has no
  content to size itself from and can't be trusted to render at any
  particular height across browsers/versions.

### 5.10 Ninth round: a Table view (default), Project Report as the fixed startup page, and the frame "cut" bug's real cause

Three unrelated requests addressed together:

- **A third view — Table — joins Chart and Buttons, and is now the
  default.** `renderPieTable(slices, recs, mode)` draws one horizontal bar
  per slice (X = the slice's summed money value via the existing
  `sliceMoneyTotal`, Y = the P/N-or-Project rows themselves — whichever the
  mode toggle has selected), sorted largest value first, using the same
  `--frame-color`-driven `color-mix()` styling as the list's frames and the
  Buttons view. `#epPieViewToggle` gained a third button
  (`data-view="table"`, listed first, `aria-pressed="true"` by default);
  `wirePieViewToggle` was generalized from a two-way `if` to a
  `{table,chart,buttons}` map so a third view didn't need special-casing.
  All three views are always rendered (`renderPie()` now also calls
  `renderPieTable`), same "never re-render on switch" approach as
  Chart/Buttons already used. Picking a bar calls the same `pieTogglePick`
  everything else uses, and `pieSetPickedClass` now also toggles `.picked`
  on the matching `.eppt-row`, so a pick made from any of the three views
  (or the list) shows as picked in all of them.
- **Project Report is now the page shown on every fresh load, full stop.**
  The router used to read `localStorage["aitech.activePage"]` and reopen
  whichever page was last active — a nice-to-have from the original build,
  not something that was ever explicitly requested — which meant a
  browsing session spent on Export Plan would silently make Export Plan
  the next "default" page too. That localStorage read (and the write that
  fed it) is gone; `show("report")` is now unconditional on load. Switching
  pages mid-session still works exactly as before, it just no longer
  persists across a reload.
- **The grouped list's "cut" frame, root-caused.** In both the hover
  (`.grouphover`) and picked (`.hl`) states, the group's outline visibly
  broke into short dashes, only ever visible in the 8px gutters between
  the Project/P·N/Qty/Value columns. Cause: `.epsl-frame` is a real
  `border`, sitting flush with the row's own box edges — the *exact same*
  pixels a `.epsl-cell`'s opaque `.hl`/`.grouphover` background fill
  covers, since a cell (painted after the frame, i.e. on top of it in DOM/
  paint order) is exactly as tall as its grid row. The border was only
  ever visible where no cell painted over it — the column gutters — which
  is what read as a "cut" through an otherwise continuous frame. (The idle
  state looked fine only because an idle cell has no fill at all, so
  there's nothing to paint over the border in the first place.) Fixed by
  drawing the outline as an outward `box-shadow` ring
  (`box-shadow:0 0 0 1.5px …` idle/hover, `0 0 0 3px var(--ink)` picked,
  stacked with the existing drop shadow as a second comma-separated value)
  instead of a `border` — a box-shadow spreads *outside* the frame's own
  box, into the blank `.epsl-gap` strip between groups (or the list's own
  side padding, for the left/right edges), territory no cell ever paints
  into, so the ring reads as one unbroken line regardless of which cells
  above it happen to be filled. Verified at 3x device-scale against both a
  hovered and a clicked multi-row group, and against the very first group
  in the list (no gap above it to spread into) — no clipping. As a related
  but separate cleanup, the per-row `border-bottom` on every `.epsl-cell`
  (a leftover from before groups had their own visible frame) was removed
  — it added a divider line through the *middle* of a multi-row group,
  undermining the "one visual block" effect the frame exists to create;
  the frame's own outline plus the `.epsl-gap` spacer between groups is
  the only separation this list needs.

### 5.11 Tenth round: cards are gone, one full table replaces them, the whole block collapses behind a KPI-row button

The biggest structural change since the August 2026 redesign (§5.2). Three
requests, addressed together because they all touch the same block:

- **The card list (§5.1/§5.3's "bottom (full) table") is deleted outright**
  — `#epList`, `renderCard`, `renderList`, `renderCount`, `#epRowCount`,
  `#epLoadMore`/`#epLoadMoreWrap`, `state.visibleCount`, `PAGE_SIZE`, and
  every `.eplist`/`.epcard`/`.epc-*`/`.epitem*`/`.epchip`/`.epmeta` CSS
  rule are gone. Fields that only ever rendered on a card — Priority,
  Type, License, Oven, Tech, Notes1, Delivery risk — currently have no
  UI anywhere on this page; that's an accepted, explicit trade of this
  round, not an oversight.
- **The old always-visible item list (§5.2–§5.10 — Project/P·N/Qty/Value,
  `#epPieList`) *is* now the Table view.** The bar-chart "Table" view
  added in §5.10 (`renderPieTable`, `#epPieTable`, `.eppt-*`) is deleted;
  `renderPieList` (kept, still the same grouping/coloring engine) grows
  from 4 columns to 7 — **Project, Project Name, P/N, Qty, Ship Date,
  Value in US$, Remarks** — and moves into `#epPieTableView`, one of the
  three panes `#epPieViewToggle` switches between (the other two, Chart
  and Buttons, are unchanged). The second, always-visible list column and
  its drag resizer (`.eppie-list-col`, `#epPieResizer`, `wireEppieResizer`,
  `.eppie-grid`) are gone entirely — there's only one column now, and the
  Table/Chart/Buttons pane renders at the full width the two columns used
  to split between them.
- **Nothing is merged across a group's rows anymore.** §5.4 merged the
  Value cell for consecutive same-project rows on the assumption that
  "same project" meant "one record's several P/N lines," which really did
  share one date/value. That assumption doesn't hold for this table: a
  project can now legitimately span several *different* source records,
  each with its own ship date and value (the flattened row's `shipDate`/
  `value`/`remarks`/`projectName` all now come from `flattenItems`, which
  carries every one of those fields per row instead of just
  `project`/`pn`/`qty`/`value`). So every row always shows its own
  figures, and a thin `.epsl-sep` line (a spacer grid row, same technique
  as the existing `.epsl-gap` between groups, tinted with the group's own
  `--frame-color`) is drawn between a group's member rows instead — the
  frame still marks the group as one colored block, the separator marks
  where one row's figures end and the next one's begin.
- **`recompute()`'s sort changed from "whole list by ship date" to
  "grouped by project, ship-date order inside each group, groups ordered
  by their own earliest ship date."** This was forced by the point above:
  once the table's grouping-by-project is meant to catch *any* same-
  project rows (not just ones the source sheet happened to keep adjacent),
  sorting `state.filtered` purely by date could interleave an unrelated
  project's row between two rows of the same project, silently splitting
  what should have been one visual group into two. Verified with a
  synthetic case (P100 at Sept 1 and Sept 15, P400 at Sept 10 — a date
  that sits *between* them): P100's four rows still render as one
  unbroken group ahead of P400, not split around it.
- **The filter bar moved from above the deleted card list to above
  `.eppie-wrap`**, and **now actually filters what it sits above.**
  Previously (§5.3) it was a deliberate, explicit split: the filter bar
  drove `state.filters`/`state.filtered`, which fed the KPI band and the
  card list, while the pie/list/buttons always read the whole sheet
  (`activeSheet().rows`), untouched by any filter. That split no longer
  makes sense once the filter bar sits directly above the Table/Chart/
  Buttons block instead of a separate list further down the page —
  `renderPie()` now builds its slices/table/chart/buttons from
  `state.filtered` instead. One knock-on fix this required:
  `pieShowSlice`'s money-total (the donut's center-label second line) was
  still summing over `activeSheet().rows` — harmless before, since the
  chart itself was already filter-independent, but now inconsistent with
  the chart's own (now filtered) slice quantities. Fixed to sum over
  `state.filtered` too, so a picked slice's qty/%/money always agree.
- **A new button in the KPI row — `#epToggleViewBtn`, "Table · Chart ·
  Buttons" — shows or hides the whole block** (filter bar + `.eppie-wrap`,
  wrapped together in `#epViewBlock`), hidden by default (`#epViewBlock`
  starts with the `hidden` attribute in the markup, not toggled by any
  JS on load). `render()` still populates everything inside it regardless
  of visibility, so revealing it is instant, never a re-render. The KPI
  band itself is restructured to make room for the button in the same
  row: `#epKpis` (`.kpis.eppinned`, still the sticky-under-header element)
  is now a flex bar, and the five KPI cards render into a nested
  `#epKpiCards` div that keeps the plain `.kpis` class — and therefore
  every one of that class's existing responsive rules — untouched, so
  Project Report's own KPI row (which has no such wrapper) is unaffected.
- **A real specificity bug, found while testing the mobile layout.** The
  filter bar's `@media (max-width:640px){ #epCardFiltersSection{
  position:relative; top:auto; … } }` override (added in §5.3, back when
  a small downward shift here was harmless because nothing sat flush
  against it) stopped fully working once `.eppie-wrap` became its
  immediate next sibling: `#page-export .filters{ top:var(--epHeaderH,
  56px) }` is an id+class selector (specificity 1,1,0), which beats a
  bare `#epCardFiltersSection` id selector (1,0,0) — so `top` stayed at
  `var(--epHeaderH)` (≈56–69px) even though `position` correctly became
  `relative`. A `position:relative` element's own reserved flow space is
  unaffected by its `top` offset, so the *next* sibling (`.eppie-wrap`)
  still laid out immediately below the filter bar's unshifted flow
  position — while the filter bar itself rendered ~60px lower, visibly
  overlapping the table underneath it (surfaced in a screenshot as what
  looked like a duplicated, ghost-colored toggle button, which was
  actually the real `#epPieToggle`/`#epPieViewToggle` pills showing
  through from underneath). Fixed by matching the winning selector's own
  `#page-export` prefix: `#page-export #epCardFiltersSection{ top:auto }`
  (2,0,0) beats `#page-export .filters` (1,1,0) outright.
- **The 7-column table scrolls horizontally on narrow screens instead of
  crushing text.** Seven columns — including a free-text Remarks column —
  can't render at a legible size in a ~360px content width no matter how
  the column `fr` ratios are tuned. `.epsl-head` and `.eppie-listscroll`
  get a `min-width:640px` under the existing 640px breakpoint, and their
  parent (`.eppie-tablecol`) becomes `overflow-x:auto`; since both are
  plain block children of that one scrolling container (not independently
  scrolled), they scroll in lockstep with no header-sync JS needed. The
  page body itself never scrolls horizontally — only this one box does.

Net effect (superseded within the same day — see §5.12): this round's
first version hid the filter bar and the table behind the reveal button
too, alongside Chart/Buttons. That wasn't what was asked for.

### 5.12 Eleventh round: only the pie/buttons visualization collapses — the table and its filters stay on screen

Same-day correction to §5.11: the request was for the table (with its
filter bar) to always be visible, right under the KPI row — only the
P/N↔Project breakdown (the donut or the button grid) should be behind the
reveal button, alongside its own two toggles (P/N↔Project and Chart↔
Buttons).

- **`#epCardFiltersSection` and `.eppie-wrap` (the table) moved back out
  of `#epViewBlock`** to sit directly after the KPI row's rule, always
  rendered. `#epViewBlock` now wraps only a single `.panel.eppie-vizwrap`
  — the old `.eppie-chart-col` content (the P/N/Project toggle, the
  Chart/Buttons toggle, and `#epPieChart`/`#epPieButtons`) — and that's
  the only thing the KPI-row button shows or hides.
- **"Table" is no longer one of the toggle's options** — there's nothing
  left for it to switch to, since the table isn't part of this panel
  anymore. `#epPieViewToggle` is back to a plain two-way Chart/Buttons
  toggle (mirroring the P/N/Project toggle it sits beside), and
  `wirePieViewToggle`'s `views` map dropped its `table` entry. The
  button's own label changed from "Table · Chart · Buttons" to "Chart ·
  Buttons" to match.
- **CSS split accordingly**: `.eppie-wrap` (the table's panel) now owns
  the flex-column/height/scroll behavior directly — no more
  `.eppie-tablecol` wrapper div, since the table is the *only* content of
  that panel now, not one of three panes sharing a box with a chart and a
  button grid. `.eppie-vizwrap` (renamed from `.eppie-chart-col`) keeps
  that behavior for the collapsible panel instead. Both get their own
  `--eppie-h` (the table taller by default, 560/480/420px across the
  three breakpoints, than the viz panel's 480/420/340px) since they're
  independent panels now, not sized off one shared variable.
- Net effect, corrected: the Export Plan page's default view (once a
  file is loaded) is the KPI row, the filter bar, and the full table —
  all three always on screen, exactly as before this round started. Only
  the pie/buttons breakdown is one click away.

### 5.13 Twelfth round: fewer filters, and one scroll instead of two

Same-day follow-up:

- **`FILTER_COLS` dropped `tech`, `priority` and `type`** — the filter
  bar is down to Project #, Customer/project, P/N and Ship date.
  `facetValues`' `tech` special-case is unreachable now but harmless
  (nothing calls it with that key anymore); left alone rather than
  ripped out for a one-line behavior that costs nothing to keep.
- **The table no longer has its own fixed height / internal scrollbar
  by default.** §5.11/§5.12 gave `.eppie-wrap` a permanent
  `height:var(--eppie-h)` with `.eppie-listscroll{overflow-y:auto}` —
  fine with 5 test rows, but with a real sheet (tens of rows) it meant
  **two** scrollbars at once: the page's own, and a second one inside a
  ~560px box showing only a third of the table — which is what read as
  the table "starting too low" with rows looking clipped at the box's
  bottom edge. Fixed by making the bounded/internally-scrolling box
  conditional: `.eppie-wrap` is just `display:flex;flex-direction:column`
  (height auto, grows to fit every row) unless `#epDash` carries a new
  `vizOpen` class, in which case `#epDash.vizOpen .eppie-wrap{
  height:var(--eppie-h) }` and `#epDash.vizOpen .eppie-listscroll{ flex:1;
  overflow-y:auto }` restore the exact previous behavior.
  `epToggleViewBtn`'s click handler toggles `vizOpen` on `#epDash` in
  lockstep with `#epViewBlock.hidden`, so the table is only ever bounded
  while the chart/buttons panel is open beneath it — the two together
  fitting in a saner total page height was the point of the box in the
  first place, and with the panel collapsed there's nothing below the
  table competing for room, so letting it grow full-height and page-
  scroll once is strictly better than a second, mostly-empty-looking
  scrollbar. Verified with a synthetic 30-row sheet: collapsed, the
  table's `scrollHeight === clientHeight` (no internal scrollbar) and
  the page scrolls once; opening the panel puts it back to a 560px box
  with `scrollHeight > clientHeight` (internal scroll again); closing
  reverts it.

### 5.14 Thirteenth round: sticky filter bar, no more filter header row, and merging back the same-record P/N lines

Three more requests, same day:

- **`#epCardFiltersSection`'s `.head` row (the "Filter this table" eyebrow
  + the old Clear-all button) is gone.** Clear all now lives in a new
  `.frow2` row directly under `.fgrid` (the field dropdowns), alongside
  `.chips` — `.frow2{display:flex}` with `.chips{flex:1}` means the chip
  list fills the left side and Clear all sits pinned to the right edge
  whether or not any chips are actually rendered (an empty `.chips` just
  collapses via the existing `.chips:empty{display:none}` rule, which
  doesn't affect the button's position since it isn't relying on
  `justify-content` to place it).
- **The filter bar is now sticky, stacked directly under the KPI band.**
  `#page-export #epCardFiltersSection{ position:sticky; top:calc(
  var(--epHeaderH,56px) + var(--epKpisH,150px)) }` — two ids (2,0,0) is
  what's needed to beat `#page-export .filters{ top:var(--epHeaderH) }`
  (1,1,0), the same specificity trap documented in §5.12. `--epKpisH` is
  a new sibling to `--epHeaderH`: `epSyncKpisHeight()` mirrors
  `epSyncHeaderHeight()`, a `ResizeObserver` on `#epKpis` keeping the
  variable equal to the KPI band's *real* rendered height (it reflows at
  the 1180/640px breakpoints, so a hardcoded number would drift). The
  old mobile-only `#page-export #epCardFiltersSection{position:relative;
  top:auto}` override from §5.12 — needed back when sticking here caused
  an overlap with `.eppie-wrap` — is gone; that was a symptom of the
  table being wrongly inside the same collapsible block as the filters,
  fixed properly in §5.12 itself, so the override was already inert
  dead weight by this point. `.filters.mExpanded .fpanel`'s mobile
  max-height budget also now subtracts `--epKpisH` alongside
  `--epHeaderH`, since the expanded dropdown has to fit under *both*
  sticky bars, not just the header.
- **P/N lines from the same source record merge again — but now
  correctly scoped.** §5.11 removed all cell-merging because a project
  can span several *different* source records with genuinely different
  dates/values (§5.10's original bug: the old merge logic keyed off
  "same project," which conflated that with "same record"). The
  complaint this round was the opposite case: two P/N lines that *are*
  the same record (the classic §4.2 scenario — one Excel row's P/N cell
  holding several newline-separated part numbers) were now showing the
  identical Value repeated once per line, which is exactly the
  redundancy the original merge feature existed to avoid.
  `flattenItems` tags each flattened row with `recKey` (`r._sheet +
  "|" + r._row` — the record's own provenance fields, already unique
  since only one sheet is ever parsed). `renderPieList` groups twice
  now: the outer pass is unchanged (consecutive same-project rows, one
  `.epsl-frame`); a new inner pass splits each outer group into
  sub-groups of consecutive rows sharing one `recKey`. A sub-group's
  Value cell renders once, spanning its rows (`.epsl-val.merged`, a
  revived version of §5.4's merged-cell CSS, now scoped correctly). A
  `.epsl-sep` divider is drawn *only between sub-groups* — never within
  one, since a sub-group's rows share a figure rather than differing.
  Ship Date and Remarks deliberately stay per-row, unmerged — same
  record-level ownership as Value, but the request specifically and
  repeatedly called out only "the price" as what should be shown once,
  so only Value was touched, to avoid guessing at unrequested scope.
  Verified against a synthetic project with 5 P/Ns split 2-and-3 across
  two source rows: two merged Value cells ($ for the 2, $ for the 3),
  exactly one separator between them, and the 2/3 split preserved in
  Qty/Remarks/Ship Date shown per line.

### 5.15 Fourteenth round: editable Remarks, and a download of the source file with just those changes

The request: let someone type a Remarks note directly into the table, and
once they've typed one, offer a button — appearing above the Remarks column
header — that hands them a new file that's an exact copy of the source
workbook with only the edited Remarks cells changed.

- **Remarks is now a merged cell per source record, like Value, reversing
  §5.14's explicit call to leave it per-row.** That earlier decision was
  right for a read-only display (repeating the same text on every P/N line
  reads fine when nothing's ever edited), but it stops being right the
  moment the cell becomes an input: N separately-editable copies of what is
  really one underlying field invites them silently going out of sync with
  each other. Merging it — same `grid-row: start / span N` technique
  `renderPieList` already uses for Value, keyed off the same sub-group
  `recKey` — makes "one record, one Remarks cell" hold structurally, not
  just by convention.
- **Each merged Remarks cell is a `<textarea>`** (`.epsl-remarks-input`),
  not a `contenteditable` span — predictable value semantics (`.value`,
  no stray `<br>`/`&nbsp;` normalization quirks contenteditable is known
  for) mattered more here than matching `.epsl-cell`'s markup exactly.
  Styled to look like plain text at rest (transparent border/background)
  and only reveal itself as an input on hover/focus, auto-growing its
  height to fit typed content (`autoGrowRemarksInput`, called on render and
  on every `input` event) so a multi-line remark doesn't clip.
- **Typing never triggers a re-render.** `render()` rebuilds
  `#epPieList`'s entire `innerHTML`, which would yank focus out from under
  someone mid-keystroke. `wireRemarksEditing`'s `input` handler instead
  writes straight into `state.remarksEdits` (a `Map`, recKey → edited
  text, cleared on every new file load) and updates just that cell's
  `.edited` class and the Download button's visibility directly — the Map
  is what actually gets read from when the list *does* eventually
  re-render (a filter change, a sort), so an edit survives that without
  needing to be re-applied.
- **A real correctness bug had to be fixed first: `_row` (each record's
  provenance row index, used nowhere before this) didn't equal the
  worksheet's actual row number.** `parseSheet` builds its row array via
  `XLSX.utils.sheet_to_json(ws, {header:1, blankrows:false})` —
  `blankrows:false` (deliberately set, to keep the "Old"/"OPEN ISSUE WITH
  R&D" headerless-sheet fallback probes in §4.1 from tripping over a
  leading blank row) skips every fully-blank row from the *output array*,
  silently shifting every following row's array index off by however many
  blank rows preceded it. Harmless while `_row` was only ever used inside
  a `recKey` string for DOM bookkeeping (any stable, unique value would've
  done) — turns into real data corruption once `_row` is used as half of
  the literal cell address a Remarks edit gets written to: a single blank
  row anywhere above the target row would silently send the edit into the
  wrong cell, possibly overwriting an unrelated one. Fixed by switching to
  `blankrows:true`, which keeps every row (blank ones included, as empty
  arrays) so the array index is always the true 0-based sheet row; blank
  rows still contribute nothing to the parsed output, since `buildRecord`
  already discards any row without a Project # (§4.3). Verified with a
  synthetic workbook carrying a deliberate blank row directly under the
  header: the edited record's row in the downloaded file landed exactly
  where it should have, one row below where the pre-fix index would have
  pointed.
- **The Download button sits in its own row, `#epRemarksActionRow`, styled
  with the exact same grid-template-columns as `.epsl-head` so it lands
  precisely over the Remarks column** — "above the Remarks header,"
  literally. `hidden` by default and toggled by
  `remarks-export.js`'s `updateRemarksActionRow()`, called after every list
  render and after every Remarks keystroke, so it can never show with zero
  pending edits or stay hidden with one pending.
- **The download itself never touches the original `File`/on-disk file —
  it hands back a brand-new one.** `state.originalBytes` (the loaded
  file's own raw bytes, kept untouched from the moment it was read) is
  left completely alone until the moment Download is clicked. **First
  version of this shipped going through `XLSX.write(state.wb, {cellStyles:
  true})` instead — see §5.16, one round later, for why that was wrong and
  had to be replaced.** The downloaded filename is the source name with
  `_updated` inserted before a `.xlsx` extension, so it can never collide
  with — or be mistaken for overwriting — the original.
- **The three "read-only" claims elsewhere on the Export Plan page were
  updated to stay honest**, since Remarks genuinely isn't read-only
  anymore: the drop-screen privacy note, the `epFilemeta` chip (was
  literally `<span>read-only</span>`, now names the Remarks column
  instead), and the page footer. The actual privacy guarantee underneath
  all three — nothing is uploaded anywhere, the file never leaves the
  browser, the *original* file on disk is never modified — didn't change
  and is still stated plainly; only the "nothing can be edited at all"
  framing was removed. Project Report's identical-looking copies of this
  same text are untouched — it really is still 100% read-only there, and
  the two pages' text lives in separate markup (see §3), so nothing here
  could have bled across.
- **Verified** with a synthetic workbook (`openpyxl`, three sheets besides
  the parsed one, a multi-P/N record, a blank row right under the header)
  driven through Playwright against the real page: the merged cell shows
  one textarea per record (not one per P/N line); editing it shows/hides
  the Download button correctly; the downloaded file opens with the edited
  text in exactly the right cell, the un-edited records' Remarks
  untouched, every other column of the edited row byte-identical to the
  source, and all three untouched sheets (`Done`, `OPEN ISSUE WITH R&D`,
  `Old`) still present. Zero console/page errors. **This round's
  formatting-fidelity testing turned out not to be thorough enough — no
  colored cells were in the test workbook, so the very real problem in
  §5.16 shipped unnoticed.**

### 5.16 Fifteenth round: the download was stripping every color — replaced XLSX.write with a byte-level ZIP/XML patch

Immediate user feedback after §5.15 shipped: the downloaded file's colors
were all gone. Two things needed fixing, reported and fixed together.

- **Root cause: this vendored SheetJS build (js-xlsx 1.15.0, the free/
  community edition) cannot write cell styles, full stop.** §5.15's
  `XLSX.write(state.wb, {cellStyles:true})` reasoning — "turn cellStyles on
  at read *and* write, so the round-tripped file keeps as much formatting
  as the writer supports" — was wrong on the load-bearing assumption: the
  writer doesn't have a real style-serialization path *at all* in this
  build. `cellStyles:true` at read time does populate `cell.s` (confirmed —
  `XLSX.read` genuinely parses fills/fonts into each cell's style object);
  `cellStyles:true` at write time does nothing with it — the styles.xml
  this build's writer emits is a fixed, hardcoded, near-empty stub (one
  default "Normal" cell style, no custom fills or fonts) regardless of
  what was read. Every fill, every font color, on every cell, came back
  blank on every download — not a partial-fidelity gap, total loss,
  because nothing about style writing is actually implemented here.
  (Community-edition style *writing* has historically been limited-to-
  absent in js-xlsx; this specific old vendored version confirms it's
  fully absent, not partial.)
- **Fix: stop using `XLSX.write` for the primary path entirely.** The only
  way to hand back a file that's genuinely "the source, unchanged, plus
  the edited Remarks cells" is to never run it through SheetJS's writer.
  An `.xlsx` is a ZIP archive of XML parts (`js/export/xlsx-patch.js`,
  new file): `state.originalBytes` — the loaded file's own raw bytes, now
  kept in state instead of being discarded after parsing — gets unzipped,
  only the one worksheet XML part for the active sheet is touched (found
  by matching `state.sheetName` against `xl/workbook.xml`'s `<sheet
  name="…">` list, then resolving that sheet's relationship ID through
  `xl/_rels/workbook.xml.rels` to its actual part path — the same lookup
  Excel itself does), and only the specific `<c>` elements for edited
  records are rewritten, via `DOMParser`/`XMLSerializer` (not regex/string
  splicing — real XML DOM edits, so malformed output isn't a risk): each
  edited cell becomes an inline string (`t="inlineStr"`, `<is><t>…</t></is>`
  — never a shared-string edit, since two unrelated cells can reference the
  same shared-string index and mutating it in place would silently change
  both), and its existing `s="…"` style-index attribute — the cell's only
  link to styles.xml, i.e. its color — is left completely alone. Every
  other part of the ZIP (`styles.xml`, `theme1.xml`, every other sheet, in
  practice every byte this app never asked to change) is copied straight
  through: decompressed then recompressed losslessly, so its *content* is
  byte-identical to the source even though its *compressed* bytes differ
  after a fresh deflate pass.
- **No ZIP or DEFLATE library is vendored for this — the codec is native.**
  `CompressionStream`/`DecompressionStream('deflate-raw')`, confirmed
  present in the pre-installed headless Chromium this app is exclusively
  verified against (`navigator.userAgent` showed Chromium 141 while
  testing this), handle the actual compression; `xlsx-patch.js` only
  implements the ZIP *container* format around them — central directory
  and local file header parsing/writing, CRC32 (standard IEEE 802.3
  table-driven implementation) — store (0) and deflate (8) methods only,
  no zip64/spanning/encryption, which covers every `.xlsx` at the sizes
  this app deals with.
- **A legacy `.xls` (BIFF8/OLE compound file, not a ZIP at all — Export
  Plan's dropzone has always accepted `.xls` alongside `.xlsx`) can't go
  through this path.** `patchRemarksIntoXlsx` checks for the `PK` zip
  signature up front and rejects immediately (`NOT_ZIP`) if it's missing;
  `remarks-export.js`'s `downloadUpdatedFile` catches that specific
  rejection and falls back to the old `XLSX.write(state.wb)` path for that
  one case only — correct data, but (per the root cause above) that file's
  own formatting is not preserved, and the toast says so explicitly rather
  than silently handing over an unstyled file with no explanation. Every
  other unexpected failure of either path shows a toast and gives up
  cleanly, rather than downloading something silently wrong.
- **Same feedback also flagged the Remarks field itself as "so thin it's
  barely visible."** Two compounding causes, both in the original §5.15
  styling: the textarea's border/background were fully transparent at
  rest (by design, to "look like plain text until touched" — reasonable
  for a once-in-a-while edit, but read as "is this even clickable?" in
  practice), and the JS auto-grow (`autoGrowRemarksInput`) actively
  *shrank* the box to `scrollHeight` on every render, collapsing empty/
  short Remarks down to one thin content-height line with no visual chrome
  at all. Fixed on both fronts: the textarea now always has a visible
  border and background (`var(--line-strong)`/`var(--surface)` at rest,
  gold on hover/focus/edited — the same gold the pending-edit indicator
  and the Download button already use), and the auto-grow function no
  longer forces `height:auto` before measuring — it clears any previous
  *inline* height (letting CSS govern the resting size) and only sets an
  explicit taller pixel height when content genuinely needs more room
  (`scrollHeight > clientHeight`), never shrinking below what CSS gives
  it. The resting size itself comes from `.epsl-remarks`'s existing
  `align-items:stretch` (already present, for the merged multi-row case)
  doing the real work — a percentage `min-height` was tried first and
  measured to resolve unpredictably (a single-row cell came back ~66% of
  its row, not the intended ~80%) against a CSS Grid track that's itself
  auto-sized from this same cell's content, a circular dependency real
  browsers resolve in ways that vary by the size of everything else in
  that row. Stretch has no such ambiguity: the textarea fills essentially
  the full content-box height of its cell (row height minus the cell's own
  padding) by construction, in both the single-row and merged multi-row
  cases, with only a small fixed-pixel `min-height` left as a floor for a
  pathological case where a row somehow computes shorter than that.
- **Verified**: a second synthetic workbook this time with actual colored
  fills — a distinct solid fill per data row plus a bold white-on-gold
  header row — driven through Playwright the same way as §5.15. Confirmed
  with `openpyxl` reading the *downloaded* file back: zero fill mismatches
  across every cell of the active sheet (including the un-edited rows'
  fills and the header's font color), the edited cell's own fill
  unchanged while its text updated, and all three untouched sheets still
  present. `getBoundingClientRect()` on the Remarks textareas confirmed
  they now fill their row's/rowspan's available height (a 3-line merged
  cell measured ~82px against a ~96px three-row span; a single-row cell
  filled its entire content-box height exactly). Zero console/page errors
  in either pass.

## 6. Remembering the last file (Export Plan)

Only the second half of Project Report's two-layer scheme (§1) applies
here: the plain **cached-file restore**, not the folder auto-connect.
Reasoning: folder auto-connect exists because the daily report lives at a
known, fixed network path and follows a predictable filename pattern
(`ProjReport_D_M_YYYY.xml`) that lets the app pick "today's file"
unattended. No such fixed path or naming convention was described for the
Export Plan workbook — it's a file someone picks by hand — so there's
nothing to auto-discover. If a fixed network location for it ever exists,
the same `showDirectoryPicker` + IndexedDB-handle pattern from Project
Report's §1.1 could be copied over.

Implementation: shares the *same* IndexedDB database (`"aitech-report"`)
and object store (`"files"`) that Project Report already creates, but under
its own key (`"lastFileExportPlan"` vs Project Report's `"lastFile"`), so
the two pages' remembered files never collide or overwrite each other.
Export Plan's own `idbOpen()` (duplicated, not shared — same reasoning as
§4) runs the identical idempotent "create the store if it doesn't exist yet"
upgrade logic at the same DB version (2), so it's safe regardless of which
module's script happens to open the database first on a fresh browser.

On every successful parse, the raw `File` is cached
(`epCacheFile`); on boot, `epBootstrap()` looks it up and, if present,
re-parses it automatically and shows a toast naming the file and when it was
saved — same UX pattern as Project Report's `restoreCached`.

## 7. Testing performed

No test framework in this repo (matches its zero-build-step philosophy), so
verification was done with Playwright driving the pre-installed headless
Chromium directly against `file://index.html`, using the two real sample
workbooks. Covered:

- Both sample files load without console/page errors, on both a desktop
  (1400×900) and an iPhone-sized (390×844) viewport.
- Header-by-name detection works identically against the "Origin" (16-col)
  and "Final" (8-col, same headers minus a few columns) versions of the
  current-month sheet — confirms the by-name matching, not position, is
  what's doing the work.
- The specific row-24 example from the request (`4C106-R720-01A`/`10`,
  `4C437-R01a`/`10`, `4P221-R01`/`15`, one shared date and value) renders
  as one card with three correctly-paired nested items, in both sample
  files (which have that project at different values/rows — confirmed the
  pairing logic, not a hardcoded expectation, is what matched).
- The positional fallback for the headerless `"Old"` (2,610 rows) and
  `"OPEN ISSUE WITH R&D"` (1 row) sheets produces sane, correctly-labelled
  records.
- The legend-row bug (§4.3) reproduced and was fixed; re-verified clean
  after the fix (KPI totals now match a hand Python cross-check).
- Interactions: "Show more" pagination, ranked-row click-to-filter,
  timeline-bar click-to-filter, combo filters, "Clear all" — all update the
  row count and re-render without errors.
- Page switcher: default page on fresh load, mobile tap toggles both
  directions, desktop button toggles, active page persists across reload.
- Cross-page isolation: dropping a file onto the Export Plan dropzone while
  it's the active page does **not** touch Project Report's state (the
  capture-phase drop guard from §3 works); Project Report's own
  file-rejection error path (tested by feeding it the Export Plan workbook)
  still produces its original, unmodified error message — confirming
  zero regressions in the existing module.
- "Remember the last file" restores automatically after a reload, with the
  expected toast, without disturbing Project Report's own (empty, in that
  test) cached state.

**August 2026 redesign (§5.2) re-verification**: the two original sample
workbooks aren't in the repo (see §2) and weren't re-attached for this pass,
so a synthetic `.xlsx` was built (openpyxl) with a "JUNE 26" sheet — a
row-24-style multi-P/N record, a single-P/N record, a negative-value
(credit) record, a record with a blank ship date, and one legend-shaped row
(`Project #` blank) to re-confirm §4.3's skip still holds — plus `Done` /
`OPEN ISSUE WITH R&D` / `Old` sheets left in the workbook specifically to
confirm they're never parsed. Verified with Playwright against
`file://index.html`, desktop (1440×900) and iPhone-sized (390×844):
sheet-toggle and filter DOM (`#epSheetToggle`, `#epFiltersSection`,
`#epQuality`, `#page-export .charts`) are gone; `#epKpis` is
`position:sticky` and its top edge tracks the header's bottom edge while
scrolled; the pie/list pair renders and reacts to the P/N ↔ Project toggle
with the expected grouped quantities; the item list stays constant across
that toggle; the card list below is unaffected; zero console/page errors on
either viewport. Also re-ran Project Report's own drop screen afterward to
confirm it still loads with zero console errors — this redesign didn't
touch that module, but the shared CSS (`:root` categorical palette vars,
the `.segmented{order:3}` interaction from §5.2) is a plausible place for a
regression to sneak in, so it was worth the extra check.

## 8. Known limitations / deliberately deferred

- No "suspect year" quality flag for Export Plan dates (Project Report has
  one — `_sus` — for dates outside a sane range). Wasn't in the request;
  worth adding if bad dates turn out to be common in this data too.
- No sort-by control on the card list (see §5.1) — default is ship-date
  ascending.
- Export Plan only accepts `.xlsx`/`.xls`, no SpreadsheetML `.xml` fast
  path — the real source is a genuine Excel workbook, so the extra parser
  wasn't built. If that ever changes, Project Report's `parseSpreadsheetML`
  (section 4 of its script) is the template to adapt.
- The `"Old"`/`"OPEN ISSUE WITH R&D"` positional fallbacks are keyed to the
  exact column order observed in the two sample files. If the source system
  ever reorders those specific sheets' columns *without* adding a header
  row back, the fallback would silently mis-map — there's no way to detect
  that from a headerless sheet. If it starts looking wrong, check `"Old"`
  first.
- No folder auto-connect for Export Plan (see §6) — by-hand file picking
  and the cached-file restore only.
- The item list beside the pie (§5.2) is rendered in one shot, with no
  "Show more" pagination like the card list has — reasonable given only the
  current sheet is ever parsed now (tens to low hundreds of rows, not the
  ~2,600-row "Old" archive), but worth revisiting if a future current-month
  sheet turns out to be unusually large.
- The pie caps at 7 explicit slices + one "N more" slice; there's no way to
  expand "N more" to see what's folded into it beyond scrolling the item
  list beside it, which isn't filtered to match.
- Remarks (§5.15, §5.16) is the only column that's editable, and only
  Remarks cells get written back — every other column is display-only, on
  purpose (that's the whole point of matching the source file "exact...
  with the changes"). For a real `.xlsx` source, formatting fidelity on
  the downloaded file is exact — see §5.16, the download is a byte-level
  ZIP/XML patch of the source's own bytes, not a SheetJS rewrite, so
  nothing about the file other than the edited cells' text ever changes.
  The one exception is a legacy `.xls` source (not a ZIP, so that patch
  path can't run at all): it falls back to `XLSX.write`, whose styling
  fidelity is whatever this vendored SheetJS build's writer can carry —
  in practice, none of it (§5.16's root-cause finding), which is why that
  fallback's toast says so explicitly rather than leaving someone to
  notice on their own. A Remarks edit is only ever written into the
  parsed *current* sheet — there's no UI to edit `Done`/`OPEN ISSUE WITH
  R&D`/`Old`, since those sheets are never parsed into records in the first
  place (§4.1).
