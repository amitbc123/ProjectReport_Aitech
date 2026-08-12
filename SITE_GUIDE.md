# Aitech Reports — Site Guide

## What this is

This site was built specifically to help you (the boss) view two kinds of documents you work with regularly — one from your computer, one from your iPhone — without installing anything, without a server, and without any data ever leaving your device.

This is **not** a site that uploads files to the internet. When you drop an Excel or XML file into it, all the reading and processing happens inside your own browser, on your computer or your iPhone, and nothing else. No file is ever sent anywhere, there's no login/password, and there's no way to "write back" to the original file — everything is view-only (read-only).

The site works with **two completely different, unrelated document types**:

1. **Project Report** — a daily report of projects (open/closed)
2. **Export Plan** — an export shipping plan

At any given moment the site shows only one of the two, with a small button next to the title to switch between them. Each side "remembers" the last file loaded into it separately (see "What the site remembers" below).

---

## 1. Project Report

### What it shows
A daily report of open/closed projects — each row has a project, customer, purchase order (PO), part numbers (AIT P/N and Board/System), quantity, shipping date, price, remarks (ATRs), project manager, and a Done/Not done status.

The file contains two "sheets" — **Open Projects Report** and **Closed Projects Report** — with a small toggle at the top of the page to switch between them.

### How to load a file
Two ways:
- **Manual drag-and-drop or file picker** — works on any device, including the iPhone. Accepts `.xml` (the format the "daily export" comes in), `.xlsx`, or `.xls`.
- **Automatic connection to a network folder** (`\\file_server\Files\Projects\Projects_Report_Daily`) — **available only in a desktop browser (Chrome/Edge)**, not on the iPhone. After a one-time connection, the site remembers the permission and, on every visit, automatically loads the newest file named `ProjReport_D_M_YYYY.xml` from that folder (a file whose name contains "india" is deliberately skipped).

### What you see on the dashboard
- **KPI row**: Total value, Total quantity, number of Projects, number of Purchase orders, and the percentage of lines marked Done — each showing "X of Y in this sheet" (i.e. filtered vs. everything).
- **Data quality bar**: how many lines are in the sheet, how many have no shipping date, how many are credit lines (negative value), how many dates look like a typo (an unlikely year), and how many numeric cells couldn't be read (counted as 0).
- **Filters** (multi-select boxes with search): Project, Customer, PO, AIT P/N, Board/System, Shipping date, ATRs, Project manager, Done. Every selected filter shows up as a removable "chip", and there's a "Clear all" button to reset everything at once.
- **Timeline chart ("When the value lands")**: bars showing total value by shipping period (month/week/year, depending on how the data spreads out) — gray = past, gold = upcoming, red = credits. Click a bar to filter to just that period.
- **Two ranked panels** side by side: "Main info" (top projects) and "Top cards by value" (the highest-value individual lines) — click a row to filter by it.
- **Status chart ("What is still outstanding")**: a Done vs. Not done breakdown, shown three ways — by line count, by quantity, by dollar value. Click a segment to filter by it.
- **A full table at the bottom of the page**: every column, click a column header to sort (ascending → descending → clear), and it stays smooth even on very large files (virtualization — only the rows actually on screen get rendered).

---

## 2. Export Plan

### What it shows
A shipping-plan table for exports — Project, Project Name, part number (P/N), Quantity, Ship Date, Value in dollars, Remarks. **There is no connection at all** between this data and Project Report — it's a completely separate file, structure, and purpose.

The file is always Excel (`.xlsx`/`.xls`), and the site reads **only the current month's sheet** in the file (detected automatically by name — sheets named "Done", "OPEN ISSUE WITH R&D" and "Old", which are archives, are ignored).

### How to load a file
Manual picking/drag-and-drop only (there's no automatic network-folder connection here, since this file has no fixed network path the way the daily project report does). The site **remembers the last file loaded** on each device separately, so on both the iPhone and the computer, the next time you open the site it automatically shows a saved copy of the last file.

### What you see on the dashboard
- **KPI row**: Total value, Total quantity, Projects, Distinct P/N, Rows shown — each "of X in this sheet".
- **A "Chart · Buttons" button** on the same row — opens/closes an extra visualization panel (closed by default) that breaks quantity down by P/N or by Project (there's a toggle to switch between the two), shown as a **donut chart** or a **button grid** — hovering or clicking highlights the matching rows in the table below.
- **A filter row** — Project #, Customer/project, P/N, Ship date — **always visible**, and stuck (sticky) to the top of the screen under the KPI row no matter how far down you scroll the table.
- **The main table** — Project, Project Name, P/N, Qty, Ship Date, Value in US$, Remarks — **always visible** (nothing needs to be clicked to see it). A few smart touches:
  - Rows belonging to the same project are grouped and color-coded (a colored frame).
  - If several part numbers (P/N) came from the very same row in the original file, they share **one combined price** instead of repeating the same figure on every line.
  - If the same project has several different "source rows" in the file (different dates/prices), they're still grouped in the same color, but with a **divider line** between them, since their price and date differ.
  - Clicking a row highlights (and scrolls to) **only** the other rows in its own project group — not other rows that happen to share the same P/N or project name.
  - When the "Chart · Buttons" panel is closed, the table simply grows to fit every row and the page itself scrolls (one scrollbar only). Opening the panel puts the table back into a fixed-height box with its own internal scroll, so everything (table + chart) fits on the page at a reasonable height.

---

## 3. Computer vs. iPhone differences

| | Computer (desktop) | iPhone / mobile |
|---|---|---|
| **Filters** | A full row of boxes, always visible | Collapse behind a "Filters" button that opens as a scrollable list, to save space |
| **KPI row** | 5 cards in one row, always visible | Collapsed by default behind a "Status" button, 2 cards per row when opened |
| **Export Plan table** (7 columns) | All columns visible at once | Scrolls **sideways** to keep the text a readable size, instead of squeezing everything into a narrow screen |
| **Automatic network-folder connection** (Project Report only) | Works (Chrome/Edge only) — the site loads the newest file on its own | **Not available** (Apple doesn't allow this kind of folder access in Safari) — you need to pick a file manually, or rely on the saved "last file" from your previous visit |
| **Switching between Project Report and Export Plan** | A small button next to the title | The same button, sized for touch |
| **Charts** (timeline, donut) | Resize to fit the panel's width | Shrink to fit the narrow screen, stay readable |

Important to understand: **each device remembers its own last file separately.** Loading a file on the computer doesn't automatically "carry over" to the iPhone — there's no shared server syncing them, since everything is stored locally and privately on each browser/device on its own.

---

## 4. Privacy & security

- **Everything runs in the browser** — no remote server, no login, no user account.
- **No file is ever uploaded anywhere** — not to the cloud, not to an Aitech server, not to any third party.
- **Read-only** — the site never writes to or modifies the source file.
- The only thing "remembered" between visits is a local, private copy (inside the browser, on the device itself) of **the last file you loaded**, so you don't have to find and pick it again every time.
