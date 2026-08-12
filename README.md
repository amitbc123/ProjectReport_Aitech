# Aitech Reports

A static, client-side-only site for viewing two unrelated report types —
**Project Report** and **Export Plan** — by loading Excel/XML files directly
in the browser. No server, no login, no file content ever leaves the device.
See `SITE_GUIDE.md` for a plain-language feature overview.

## Layout

```
index.html            Thin shell: markup for both pages, <link>/<script> tags.
css/
  base.css             Shared tokens, header shell, page switcher, and the
                        dashboard component library (KPI cards, filter combo-
                        boxes, charts, table) — used directly by Project
                        Report and reused (with #page-export overrides on
                        top) by Export Plan. Load before export-plan.css.
  export-plan.css       Export Plan-specific: sticky KPI band, the always-
                        visible table + collapsible pie/buttons panel, the
                        sticky filter bar.
vendor/
  xlsx.full.min.js       SheetJS 0.18.5, vendored verbatim (not from a CDN)
                          so no file content or library fetch ever leaves
                          the device.
js/
  router.js              Switches between #page-report and #page-export.
                          Project Report is always shown on a fresh load.
  report/                 Project Report page logic (one module per section
                            of the original file's own comment banners):
                            columns, format, parse-xml (SpreadsheetML 2003
                            fast path), parse-xlsx (SheetJS compatibility
                            path), state, filters, kpi, filter-bar, timeline,
                            ranked, status, table (virtualized), render,
                            file-intake, folder-autoload (Chrome/Edge File
                            System Access API), main (entry point).
  export/                 Export Plan page logic, same one-module-per-
                            section approach: columns, format, rows (header
                            detection + row building), state, kpi, pie
                            (donut + linked list), filter-bar, render,
                            file-intake, idb-store, main (entry point).
```

Every module maps to a section the original single-file `index.html` already
marked with a `/* ==== ... ==== */` comment banner — see each file's header
comment for which one.

## Notes for future edits

- Column matching is always by header name, never position, in every parser.
- The formatting/value-coercion helpers are intentionally duplicated between
  `js/report/format.js` and `js/export/format.js` rather than shared, so an
  edit to one page's formatting can never accidentally change the other's.
- Both pages share one IndexedDB database (`aitech-report`) and one object
  store (`files`), but write under distinct keys (`lastFile` for Project
  Report, `lastFileExportPlan` for Export Plan) — never change either without
  updating both `js/report/folder-autoload.js` and `js/export/idb-store.js`
  together, or a user's previously-saved file will silently stop loading.
- No build step: this is plain ES modules (`<script type="module">`) and
  plain CSS, deployed exactly as committed via GitHub Pages.
