/* Export Plan — 4. State
   ------------------------------------------------------------
   state.filters/state.filtered drive the whole Table/Chart/
   Buttons block (§7 filter bar, §6 pie/list, KPI band) — they all
   report filtered-vs-total from the same two. */
import { BLANK } from './columns.js';
import { fmtDate } from './format.js';

export var state = {
  fileName:"", sheet:null, pieMode:"pn",
  filters:{}, filtered:[], facets:{}, totals:null
};
export function activeSheet(){ return state.sheet; }

export var FILTER_COLS = [
  { key:"projectNo",   label:"Project #" },
  { key:"projectName", label:"Customer / project" },
  { key:"pn",           label:"P/N" },
  { key:"shipDate",     label:"Ship date" }
];
function facetValues(rec, key){
  if (key === "pn") return rec.items.length ? rec.items.map(function(it){ return it.pn; }) : [BLANK];
  if (key === "tech") return rec.techLines.length ? rec.techLines : [BLANK];
  if (key === "shipDate") return [rec.shipDate === null ? BLANK : fmtDate(rec.shipDate)];
  var v = rec[key];
  return [v ? v : BLANK];
}
function recordMatches(rec, key, selected){
  var vals = facetValues(rec, key);
  for (var i = 0; i < vals.length; i++) if (selected.has(vals[i])) return true;
  return false;
}
export function anyFilter(){
  for (var k in state.filters) if (state.filters[k] && state.filters[k].size) return true;
  return false;
}
export function recompute(){
  var recs = activeSheet().rows;
  var active = FILTER_COLS.filter(function(c){ return state.filters[c.key] && state.filters[c.key].size; });
  var facets = {}; FILTER_COLS.forEach(function(c){ facets[c.key] = new Map(); });
  var out = [];
  for (var i = 0; i < recs.length; i++){
    var rec = recs[i];
    var fails = 0, failKey = null;
    for (var a = 0; a < active.length; a++){
      if (!recordMatches(rec, active[a].key, state.filters[active[a].key])){
        fails++; failKey = active[a].key;
        if (fails > 1) break;
      }
    }
    if (fails === 0) out.push(rec);
    if (fails <= 1){
      for (var c = 0; c < FILTER_COLS.length; c++){
        var key = FILTER_COLS[c].key;
        if (fails === 1 && key !== failKey) continue;
        facetValues(rec, key).forEach(function(v){ facets[key].set(v, (facets[key].get(v) || 0) + 1); });
      }
    }
  }
  // Grouped by project (so renderPieList's "consecutive rows, same project"
  // grouping/coloring always holds, even when a project's several records
  // land far apart in the source sheet), each project's own rows sorted by
  // ship date within the group, and the groups themselves ordered by
  // their earliest ship date — nulls-dated groups/rows sort last, ties
  // keep the project's first-appearance order (Array#sort is stable).
  var order = [], groups = new Map();
  out.forEach(function(r){
    var k = r.projectNo || BLANK, g = groups.get(k);
    if (!g){ g = []; groups.set(k, g); order.push(k); }
    g.push(r);
  });
  function byShipDate(a, b){
    if (a.shipDate === null && b.shipDate === null) return 0;
    if (a.shipDate === null) return 1;
    if (b.shipDate === null) return -1;
    return a.shipDate - b.shipDate;
  }
  var groupMinDate = {};
  order.forEach(function(k){
    var list = groups.get(k);
    list.sort(byShipDate);
    groupMinDate[k] = list.length && list[0].shipDate !== null ? list[0].shipDate : null;
  });
  order.sort(function(a, b){
    var da = groupMinDate[a], db = groupMinDate[b];
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
  var sorted = [];
  order.forEach(function(k){ sorted = sorted.concat(groups.get(k)); });
  state.facets = facets;
  state.filtered = sorted;
}
