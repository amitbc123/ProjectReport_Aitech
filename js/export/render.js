/* Export Plan — 9. Master render + sheet switching */
import { state, activeSheet, recompute } from './state.js';
import { totalsOf, renderKpis } from './kpi.js';
import { renderCardChips } from './filter-bar.js';
import { renderPie } from './pie.js';

export function render(){
  recompute();
  renderKpis();
  renderCardChips();
  renderPie();
}
export function switchSheet(sheet){
  state.sheet = sheet;
  state.filters = {};
  state.totals = totalsOf(activeSheet().rows);
  render();
}
