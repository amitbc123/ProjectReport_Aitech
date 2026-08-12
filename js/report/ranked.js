/* Project Report — 11. Ranked tables */
import { BLANK, TODAY, MAX_RANK_ROWS } from './columns.js';
import { esc, money, moneyDec, fmtDate, nfInt } from './format.js';
import { state } from './state.js';
import { setOnly } from './filter-bar.js';

function groupStats(rows, key){
  var m = new Map();
  for (var i = 0; i < rows.length; i++){
    var r = rows[i];
    var k = r[key] === "" ? BLANK : r[key];
    var g = m.get(k);
    if (!g){ g = { k:k, ext:0, qty:0, n:0, cust:new Map(), pm:new Map(), sup:new Map(), next:null, last:null }; m.set(k,g); }
    g.ext += r._ext; g.qty += r._qty; g.n++;
    if (r.Remarks)           g.cust.set(r.Remarks, (g.cust.get(r.Remarks)||0) + 1);
    if (r["Project Manager"]) g.pm.set(r["Project Manager"], (g.pm.get(r["Project Manager"])||0) + 1);
    if (r["Supplier Item"])  g.sup.set(r["Supplier Item"], (g.sup.get(r["Supplier Item"])||0) + 1);
    if (r._date !== null){
      if (r._date >= TODAY && (g.next === null || r._date < g.next)) g.next = r._date;
      if (g.last === null || r._date > g.last) g.last = r._date;
    }
  }
  return Array.from(m.values()).sort(function(a,b){ return Math.abs(b.ext) - Math.abs(a.ext); });
}
// Most frequent value in a counted map, with "+n" when the group holds more than one.
function dominant(map, cls, mono){
  if (!map.size) return '<span class="'+cls+'">—</span>';
  var best = null, bn = -1;
  map.forEach(function(n,v){ if (n > bn){ bn = n; best = v; } });
  var extra = map.size > 1 ? ' +'+(map.size-1) : "";
  return '<span class="'+cls+(mono?" mono":"")+'" title="'+esc(Array.from(map.keys()).join(", "))+'">'+esc(best)+extra+'</span>';
}
function shipCell(g){
  if (g.next !== null) return '<span class="sh" title="Next shipping date in this group">'+fmtDate(g.next)+'</span>';
  if (g.last !== null) return '<span class="sh past" title="Nothing upcoming — last shipping date">'+fmtDate(g.last)+'</span>';
  return '<span class="sh past">—</span>';
}
function unitPrice(g){
  if (!g.qty) return '<span class="r">—</span>';
  return '<span class="r">'+moneyDec(g.ext / g.qty)+'</span>';
}
function emptyBlock(host){
  host.innerHTML = '<div class="empty"><b>Nothing to rank</b>No rows match the current filters.</div>';
}
function head(tpl, labels, rights){
  return '<div class="rth" style="grid-template-columns:'+tpl+'">' +
    labels.map(function(h,i){ return '<div'+(rights[i]?' style="text-align:right"':'')+'>'+h+'</div>'; }).join("") +
    '</div>';
}
function moreNote(total){
  return total > MAX_RANK_ROWS
    ? '<div class="rtmore">Showing the top '+nfInt.format(MAX_RANK_ROWS)+' of '+nfInt.format(total)+'. Use the filters to narrow.</div>'
    : "";
}
function wireRows(host, onPick){
  host.querySelectorAll(".rrow[data-v]").forEach(function(r){
    function go(){ onPick(r.dataset.v); }
    r.addEventListener("click", go);
    r.addEventListener("keydown", function(e){ if (e.key==="Enter"||e.key===" "){ e.preventDefault(); go(); } });
  });
}

var TPL_MAIN = "minmax(74px,.9fr) minmax(94px,1.45fr) 62px 106px minmax(78px,1.05fr)";
var TPL_CARD = "minmax(84px,1.2fr) minmax(66px,.9fr) 54px 84px 86px 102px 40px";

// Same columns for every filter state — the header never moves.
function renderMainInfo(rows){
  var host = document.getElementById("byProject");
  if (!rows.length) return emptyBlock(host);
  var groups = groupStats(rows, "Project");
  var scale = Math.max.apply(null, groups.slice(0, MAX_RANK_ROWS).map(function(g){ return Math.abs(g.ext); }).concat([1]));

  var html = '<div class="rtscroll">' + head(TPL_MAIN, ["Project","Customer","Qty","Value","Project manager"], [0,0,1,1,0]);
  html += groups.slice(0, MAX_RANK_ROWS).map(function(g,i){
    var w = Math.abs(g.ext) / scale * 100;
    return '<div class="rrow" role="button" tabindex="0" data-v="'+esc(g.k)+'" style="grid-template-columns:'+TPL_MAIN+'" '+
      'title="'+esc(g.k)+' · '+nfInt.format(g.n)+' lines">'+
      '<span class="bg'+(g.ext<0?" neg":"")+'" style="width:'+w+'%;animation-delay:'+(Math.min(i,20)*22)+'ms"></span>'+
      '<span class="lab mono">'+esc(g.k)+'</span>'+
      dominant(g.cust, "cust", false) +
      '<span class="r">'+nfInt.format(g.qty)+'</span>'+
      '<span class="v'+(g.ext<0?" neg":"")+'">'+money(g.ext)+'</span>'+
      dominant(g.pm, "sup", false) +
      '</div>';
  }).join("") + moreNote(groups.length) + '</div>';

  host.innerHTML = html;
  wireRows(host, function(v){ setOnly("Project", v); });
}

function renderTopCards(rows){
  var host = document.getElementById("byItem");
  if (!rows.length) return emptyBlock(host);
  var groups = groupStats(rows, "Item Number");
  var top = groups.slice(0, MAX_RANK_ROWS);
  var total = groups.reduce(function(s,g){ return s + g.ext; }, 0);
  var scale = Math.max.apply(null, top.map(function(g){ return Math.abs(g.ext); }).concat([1]));

  var html = '<div class="rtscroll">' + head(TPL_CARD, ["Board/System","AIT P/N","Qty","Ship date","Unit price","Total price",""], [0,0,1,1,1,1,1]);
  html += top.map(function(g,i){
    var w = Math.abs(g.ext) / scale * 100;
    var share = total ? Math.round(Math.abs(g.ext) / Math.abs(total) * 100) : 0;
    return '<div class="rrow" role="button" tabindex="0" data-v="'+esc(g.k)+'" style="grid-template-columns:'+TPL_CARD+'" '+
      'title="'+esc(g.k)+' · '+nfInt.format(g.n)+' lines">'+
      '<span class="bg'+(g.ext<0?" neg":"")+'" style="width:'+w+'%;animation-delay:'+(Math.min(i,20)*22)+'ms"></span>'+
      dominant(g.sup, "sup", true) +
      '<span class="lab mono">'+esc(g.k)+'</span>'+
      '<span class="r">'+nfInt.format(g.qty)+'</span>'+
      shipCell(g) +
      unitPrice(g) +
      '<span class="v'+(g.ext<0?" neg":"")+'">'+money(g.ext)+'</span>'+
      '<span class="pc">'+share+'%</span>'+
      '</div>';
  }).join("") + moreNote(groups.length) + '</div>';

  host.innerHTML = html;
  wireRows(host, function(v){ setOnly("Item Number", v); });
}

export function renderRanked(){
  var rows = state.filtered;
  document.getElementById("projHint").innerHTML =
    'Every project in the current view, ranked by <span class="mono">EXT DOLLAR PRICE</span>. Click a row to filter.';
  renderMainInfo(rows);
  renderTopCards(rows);
}
