/* Export Plan — 1. Column contract for the workbook
   ------------------------------------------------------------
   The source (the "Origin" file) carries up to 14 named columns,
   matched by header text, never by position — same rule as the
   Project Report parser. Two sheets in the real file ("Old" and
   "OPEN ISSUE WITH R&D") were exported without a header row at
   all; those fall back to a fixed, documented column order for
   that sheet only, so their rows are not silently dropped.

   P/N and Qty. are special: a cell can hold several lines
   (line-break separated), and the matching line in the sibling
   cell belongs to it — e.g. P/N line 2 pairs with Qty line 2 of
   the same row. Every other column (Ship Date, Value, Remarks,
   Priority, …) applies to the whole row, not to one P/N. */

export var FIELD_ALIASES = {
  priority:      ["priority"],
  type:          ["type"],
  projectNo:     ["project #", "project#", "project no", "project number"],
  projectName:   ["project #/ name", "project#/ name", "project #/name", "project # / name", "project name"],
  pn:            ["p/n", "pn"],
  qty:           ["qty.", "qty", "quantity"],
  shipDate:      ["ship date"],
  value:         ["value in us$", "value in usd", "value"],
  license:       ["exp. license status", "exp license status", "license status"],
  notes1:        ["notes1", "notes 1"],
  deliveryRisks: ["delivery risks & dependencies", "delivery risks and dependencies", "notes 2", "notes2"],
  remarks:       ["remarks"],
  tech:          ["tech.", "tech"],
  oven:          ["oven"]
};
// Full row order in the current-month sheet, also used as the positional
// fallback for a header-less sheet that looks like a full export row
// (12+ populated leading cells) — matches "OPEN ISSUE WITH R&D".
export var FALLBACK_FULL = ["priority","type","projectNo","projectName","pn","qty","shipDate","value","license","notes1","deliveryRisks","remarks","tech","oven"];
// The "Done" sheet's row order, also used as the positional fallback for
// the "Old" archive sheet, which carries the same 11 columns with no
// header row at all.
export var FALLBACK_DONE = ["priority","type","projectNo","projectName","pn","qty","shipDate","value","license","notes1","deliveryRisks"];
export var FIXED_SHEET_ORDER = ["done", "open issue with r&d", "old"];  // everything else ("JUNE 26", "JULY 26", …) sorts first, as "current"
export var BLANK = "(Blank)";
export var ROW_H_HINT = 34;
export var TODAY = (function(){ var d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); })();
