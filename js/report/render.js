/* Project Report — 15. Master render + sheet switching */
import { ATR_YES } from './columns.js';
import { esc, nfInt } from './format.js';
import { state, sheet } from './state.js';
import { recompute } from './filters.js';
import { totalsOf, renderKpis, renderQuality } from './kpi.js';
import { renderChips } from './filter-bar.js';
import { renderTimeline } from './timeline.js';
import { renderRanked } from './ranked.js';
import { renderStatus } from './status.js';
import { renderCount, renderHeader, paintRows } from './table.js';

export function render(){
  recompute();
  renderKpis();
  renderChips();
  renderTimeline();
  renderRanked();
  renderStatus();
  renderCount();
  renderHeader();
  paintRows(true);
}
function applyDefaultFilters(){
  // ATRs starts on "Mentions ATR" when the active sheet has any ATR line.
  if (sheet().rows.some(function(r){ return r._atr; }))
    state.filters["General Remarks"] = new Set([ATR_YES]);
}
export function switchSheet(i){
  state.active = i;
  state.filters = {}; state.period = null; state.sort = { key:null, dir:0 };
  applyDefaultFilters();
  state.totals = totalsOf(sheet().rows);
  renderSheetToggle();
  renderQuality();
  render();
}
export function renderSheetToggle(){
  var t = document.getElementById("sheetToggle");
  t.innerHTML = state.sheets.map(function(s,i){
    return '<button aria-pressed="'+(i===state.active)+'" data-i="'+i+'">'+
      esc(s.name.replace(/ Projects Report$/,"")) + '<span class="c">'+nfInt.format(s.rows.length)+'</span></button>';
  }).join("");
  t.querySelectorAll("button").forEach(function(b){
    b.addEventListener("click", function(){ if (+b.dataset.i !== state.active) switchSheet(+b.dataset.i); });
  });
}
