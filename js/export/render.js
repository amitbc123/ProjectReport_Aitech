/* Export Plan — 9. Master render + sheet switching */
import { state, activeSheet, recompute } from './state.js?v=20260819b';
import { totalsOf, renderKpis } from './kpi.js?v=20260819b';
import { renderCardChips } from './filter-bar.js?v=20260819b';
import { renderPie } from './pie.js?v=20260819b';

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
