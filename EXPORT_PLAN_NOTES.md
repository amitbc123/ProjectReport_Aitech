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
