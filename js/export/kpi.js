/* Export Plan — 5. KPI */
import { state } from './state.js';
import { money, nfInt, esc } from './format.js';

export function totalsOf(recs){
  var t = { value:0, qty:0, n:recs.length, proj:new Set(), pn:new Set() };
  recs.forEach(function(r){
    t.value += r.value;
    if (r.projectNo) t.proj.add(r.projectNo);
    r.items.forEach(function(it){ t.qty += it.qty || 0; t.pn.add(it.pn); });
  });
  return t;
}
export function renderKpis(){
  var f = totalsOf(state.filtered), a = state.totals;
  var cards = [
    { lab:"Total value",    val:money(f.value), sub:"of " + money(a.value) + " in this sheet", neg:f.value < 0 },
    { lab:"Total quantity", val:nfInt.format(f.qty), sub:"of " + nfInt.format(a.qty) + " units in this sheet" },
    { lab:"Projects",       val:nfInt.format(f.proj.size), sub:"of " + nfInt.format(a.proj.size) + " in this sheet" },
    { lab:"Distinct P/N",   val:nfInt.format(f.pn.size), sub:"of " + nfInt.format(a.pn.size) + " in this sheet" },
    { lab:"Rows shown",     val:nfInt.format(f.n), sub:"of " + nfInt.format(a.n) + " rows in this sheet" }
  ];
  document.getElementById("epKpiCards").innerHTML = cards.map(function(c){
    return '<div class="kpi"><div class="lab">'+c.lab+'</div>'+
           '<div class="val'+(c.neg?" neg":"")+'">'+esc(c.val)+'</div>'+
           '<div class="sub">'+esc(c.sub)+'</div></div>';
  }).join("");
}
