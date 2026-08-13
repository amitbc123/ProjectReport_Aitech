/* Export Plan — 3. Header detection + row building */
import { FIELD_ALIASES, FALLBACK_FULL, FALLBACK_DONE, FIXED_SHEET_ORDER } from './columns.js?v=20260813';
import { clean, toNumber, toDateMs, normHeader, splitLines } from './format.js?v=20260813';

function findHeaderMap(aoa){
  for (var r = 0; r < Math.min(12, aoa.length); r++){
    var row = aoa[r] || [];
    var map = {}, hits = 0, hasPN = false, hasProj = false;
    for (var c = 0; c < row.length; c++){
      var h = normHeader(row[c]);
      if (!h) continue;
      for (var k in FIELD_ALIASES){
        if (map[k] !== undefined) continue;
        if (FIELD_ALIASES[k].indexOf(h) !== -1){
          map[k] = c; hits++;
          if (k === "pn") hasPN = true;
          if (k === "projectNo" || k === "projectName") hasProj = true;
          break;
        }
      }
    }
    if (hits >= 4 && hasPN && hasProj) return { row:r, map:map };
  }
  return null;
}
function buildRecord(arr, map, sheetName, rowIdx){
  function get(key){
    var idx = map[key];
    if (idx === undefined) return "";
    var v = arr[idx];
    return (v === undefined || v === null) ? "" : clean(String(v));
  }
  var projectNo = get("projectNo"), projectName = get("projectName"), pnRaw = get("pn");
  // Every genuine line carries a Project #. Rows without one are blank
  // spacers or stray captions living in the data area (the real file has
  // both — e.g. a "C=Commercial, D=Defense" legend row, or a colour-key
  // caption that happens to land in the Name/P·N columns) — never real
  // export lines, so skip them rather than showing a fake "(Blank)" project.
  if (!projectNo) return null;

  var pnLines = pnRaw ? pnRaw.split("\n").map(clean).filter(function(x){ return x !== ""; }) : [];
  var qtyRaw = get("qty");
  var qtyLines = qtyRaw ? qtyRaw.split("\n").map(clean) : [];
  var items = [], mismatch = false;
  if (pnLines.length === 0){
    items = [];
  } else if (qtyLines.length === pnLines.length){
    items = pnLines.map(function(pn, i){ return { pn:pn, qty:toNumber(qtyLines[i]) }; });
  } else if (qtyLines.length === 1 && pnLines.length > 1){
    var q = toNumber(qtyLines[0]);
    items = pnLines.map(function(pn){ return { pn:pn, qty:q }; });
    mismatch = true;
  } else {
    // Line counts don't match cleanly. Keep every P/N (never invent or
    // drop one) and pair what we can — better a visible "—" than a
    // wrong number quietly attached to the wrong part.
    items = pnLines.map(function(pn, i){ return { pn:pn, qty: i < qtyLines.length ? toNumber(qtyLines[i]) : null }; });
    mismatch = true;
  }

  var value = toNumber(get("value"));
  var dateRaw = get("shipDate");
  return {
    _sheet: sheetName, _row: rowIdx,
    priority: get("priority"), type: get("type"),
    projectNo: projectNo, projectName: projectName,
    items: items, _qtyMismatch: mismatch,
    shipDate: toDateMs(dateRaw), _noDate: dateRaw === "",
    value: value == null ? 0 : value, _badValue: value == null && get("value") !== "",
    license: get("license"), notes1: get("notes1"), deliveryRisks: get("deliveryRisks"),
    remarks: get("remarks"), techLines: splitLines(get("tech")), oven: get("oven")
  };
}
function parseSheet(ws, name){
  var aoa = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:"", blankrows:false });
  if (!aoa.length) return { name:name, rows:[], recognized:true, skippedRaw:0 };

  var h = findHeaderMap(aoa), map, dataStart, recognized = true;
  if (h){
    map = h.map; dataStart = h.row + 1;
  } else {
    var norm = name.trim().toLowerCase();
    var fallback = norm === "old" ? FALLBACK_DONE : null;
    if (!fallback){
      var probe = aoa[0] || [];
      var filled = probe.filter(function(v){ return v !== undefined && v !== null && v !== ""; }).length;
      if (filled >= 8) fallback = FALLBACK_FULL;
    }
    if (fallback){
      map = {}; fallback.forEach(function(k, i){ map[k] = i; });
      dataStart = 0;
    } else {
      recognized = false; map = {}; dataStart = aoa.length;
    }
  }
  var rows = [];
  for (var r = dataStart; r < aoa.length; r++){
    var rec = buildRecord(aoa[r] || [], map, name, r);
    if (rec) rows.push(rec);
  }
  return { name:name, rows:rows, recognized:recognized, skippedRaw: recognized ? 0 : aoa.length };
}
export function parseExportWorkbook(u8){
  if (typeof XLSX === "undefined") throw new Error("NO_XLSX");
  var wb = XLSX.read(u8, { type:"array", cellDates:false, cellStyles:false, sheetStubs:true });
  // Only the current sheet (whichever isn't "Done" / "OPEN ISSUE WITH R&D" /
  // "Old") is shown — see EXPORT_PLAN_NOTES.md §"no other tab interests us".
  // Sorting by name alone, before parsing, means the other sheets' (the
  // "Old" archive alone runs ~2,600 rows) never get parsed at all.
  var ordered = wb.SheetNames.slice().sort(function(a, b){
    var ia = FIXED_SHEET_ORDER.indexOf(a.trim().toLowerCase());
    var ib = FIXED_SHEET_ORDER.indexOf(b.trim().toLowerCase());
    return (ia === -1 ? -1 : ia) - (ib === -1 ? -1 : ib);
  });
  var sheet = parseSheet(wb.Sheets[ordered[0]], ordered[0]);
  if (!sheet.recognized) throw new Error("NO_SHEETS");
  return { sheet:sheet };
}
