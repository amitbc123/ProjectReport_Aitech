/* Project Report — 6. State */
import { NOT_DONE, ATR_YES, ATR_NO, BLANK } from './columns.js?v=20260813';
import { fmtDate } from './format.js?v=20260813';

export var state = {
  fileName:"", sheets:[], active:0,
  filters:{},                    // colKey -> Set of facet values
  period:null,                   // { from, to, label } set by clicking the timeline
  sort:{ key:null, dir:0 },
  filtered:[], facets:{}, totals:null
};
export function sheet(){ return state.sheets[state.active]; }

export function facetOf(row, key){
  if (key === "Done")            return row.Done ? row.Done : NOT_DONE;
  if (key === "General Remarks") return row._atr ? ATR_YES : ATR_NO;
  if (key === "Shipping Date")   return row._date === null ? BLANK : fmtDate(row._date);
  return row[key] === "" ? BLANK : row[key];
}
export function anyFilter(){
  for (var k in state.filters) if (state.filters[k] && state.filters[k].size) return true;
  return !!state.period;
}
