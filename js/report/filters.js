/* Project Report — 7. Filtering + cross-filtered facet counts */
import { COLS } from './columns.js?v=20260819';
import { state, sheet, facetOf } from './state.js?v=20260819';

export var FILTER_COLS = COLS.filter(function(c){ return c.filter; });

function periodOk(row){
  if (!state.period) return true;
  return row._date !== null && row._date >= state.period.from && row._date <= state.period.to;
}
function sortRows(){
  var s = state.sort;
  if (!s.key || !s.dir) return;
  var col = COLS.filter(function(c){ return c.key === s.key; })[0];
  var dir = s.dir;
  state.filtered.sort(function(a,b){
    var x, y;
    if (col.type === "num")        { x = a._qty;  y = b._qty; }
    else if (col.type === "money") { x = a._ext;  y = b._ext; }
    else if (col.type === "date")  {
      x = a._date; y = b._date;
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
    } else {
      x = a[col.key].toLowerCase(); y = b[col.key].toLowerCase();
      if (x === "" && y !== "") return 1;
      if (y === "" && x !== "") return -1;
    }
    return x < y ? -dir : x > y ? dir : 0;
  });
}
export function recompute(){
  var rows = sheet().rows;
  var active = FILTER_COLS.filter(function(c){ return state.filters[c.key] && state.filters[c.key].size; });
  var facets = {};
  FILTER_COLS.forEach(function(c){ facets[c.key] = new Map(); });

  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var okPeriod = periodOk(row);
    var fails = 0, failKey = null;
    for (var a = 0; a < active.length; a++) {
      if (!state.filters[active[a].key].has(facetOf(row, active[a].key))) {
        fails++; failKey = active[a].key;
        if (fails > 1) break;
      }
    }
    if (okPeriod && fails === 0) out.push(row);
    // A value is counted if its row passes every filter except the one on its own column.
    if (okPeriod && fails <= 1) {
      for (var c = 0; c < FILTER_COLS.length; c++) {
        var key = FILTER_COLS[c].key;
        if (fails === 1 && key !== failKey) continue;
        var v = facetOf(row, key);
        facets[key].set(v, (facets[key].get(v) || 0) + 1);
      }
    }
  }
  state.facets = facets;
  state.filtered = out;
  sortRows();
}
