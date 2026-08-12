/* Project Report — 8. KPI band */
import { state, sheet } from './state.js';
import { nfInt, money, esc, pct } from './format.js';

export function totalsOf(rows){
  var t = { ext:0, qty:0, done:0, n:rows.length, proj:new Set(), po:new Set() };
  rows.forEach(function(r){
    t.ext += r._ext; t.qty += r._qty;
    if (r.Done) t.done++;
    if (r.Project) t.proj.add(r.Project);
    if (r["Purchase Order"]) t.po.add(r["Purchase Order"]);
  });
  return t;
}
export function renderKpis(){
  var f = totalsOf(state.filtered), a = state.totals;
  var donePct = f.n ? pct(f.done, f.n) : 0;
  var cards = [
    { lab:"Total value",       val:money(f.ext),                 sub:"of " + money(a.ext) + " in this sheet", neg:f.ext < 0 },
    { lab:"Total quantity",    val:nfInt.format(f.qty),          sub:"of " + nfInt.format(a.qty) + " units in this sheet" },
    { lab:"Projects",          val:nfInt.format(f.proj.size),    sub:"of " + nfInt.format(a.proj.size) + " in this sheet" },
    { lab:"Purchase orders",   val:nfInt.format(f.po.size),      sub:"of " + nfInt.format(a.po.size) + " in this sheet" },
    { lab:"Lines marked Done", val:donePct + "%", sub:nfInt.format(f.done) + " of " + nfInt.format(f.n) + " lines shown",
      good: donePct >= 80, warn: f.n > 0 && donePct < 40 }
  ];
  document.getElementById("kpis").innerHTML = cards.map(function(c){
    return '<div class="kpi"><div class="lab">'+c.lab+'</div>'+
           '<div class="val'+(c.neg?" neg":"")+(c.good?" good":"")+(c.warn?" warn":"")+'">'+esc(c.val)+'</div>'+
           '<div class="sub">'+esc(c.sub)+'</div></div>';
  }).join("");
}
export function renderQuality(){
  var rows = sheet().rows, noDate=0, neg=0, bad=0, sus=0;
  rows.forEach(function(r){
    if (r._date === null) noDate++;
    if (r._ext < 0) neg++;
    if (r._bad) bad++;
    if (r._sus) sus++;
  });
  var bits = ['<span><i></i>'+nfInt.format(rows.length)+' lines in this sheet</span>'];
  if (noDate) bits.push('<span><i></i>'+nfInt.format(noDate)+' without a shipping date</span>');
  if (neg)    bits.push('<span><i></i>'+nfInt.format(neg)+' credit lines (negative value)</span>');
  if (sus)    bits.push('<span><i class="warn"></i>'+nfInt.format(sus)+' shipping date looks like a typo</span>');
  if (bad)    bits.push('<span><i class="warn"></i>'+nfInt.format(bad)+' numeric cells could not be read — counted as 0</span>');
  document.getElementById("quality").innerHTML = bits.join("");
}
