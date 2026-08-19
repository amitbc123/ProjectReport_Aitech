/* Project Report — 13. Table (virtualized: only on-screen rows render) */
import { COLS, ROW_H } from './columns.js?v=20260819b';
import { esc, fmtDate, money, nfInt } from './format.js?v=20260819b';
import { state, sheet, anyFilter } from './state.js?v=20260819b';
import { recompute } from './filters.js?v=20260819b';

var tpl = COLS.map(function(c){ return c.w + "px"; }).join(" ") + " 1fr";

export function renderHeader(){
  var h = document.getElementById("hrow");
  h.style.gridTemplateColumns = tpl;
  h.innerHTML = COLS.map(function(c){
    var on = state.sort.key === c.key && state.sort.dir;
    var ar = state.sort.dir === 1 ? "▲" : "▼";
    return '<div class="hcell'+(c.right?" r":"")+(on?" sorted":"")+'" data-k="'+esc(c.key)+'" role="columnheader" tabindex="0" '+
      'aria-sort="'+(on ? (state.sort.dir===1?"ascending":"descending") : "none")+'">'+
      esc(c.label)+'<span class="ar">'+(on?ar:"")+'</span></div>';
  }).join("");
  h.querySelectorAll(".hcell").forEach(function(el){
    function go(){
      var k = el.dataset.k;
      if (state.sort.key !== k) state.sort = { key:k, dir:1 };
      else if (state.sort.dir === 1) state.sort.dir = -1;
      else state.sort = { key:null, dir:0 };
      recompute(); renderHeader(); paintRows(true);
    }
    el.addEventListener("click", go);
    el.addEventListener("keydown", function(e){ if (e.key==="Enter"||e.key===" "){ e.preventDefault(); go(); } });
  });
}
function cellHtml(r, c){
  var cls = "tc" + (c.right ? " r" : "") + (c.mono ? " mono" : "");
  if (c.type === "date"){
    var t = r._sus ? ' title="Unlikely year — check the source row"' : "";
    return '<div class="'+cls+(r._date===null?" dim":"")+(r._sus?" bad":"")+'"'+t+'>'+fmtDate(r._date)+'</div>';
  }
  if (c.type === "num"){
    if (r._bad & 1) return '<div class="'+cls+' bad" title="Not a number — counted as 0">'+esc(r[c.key])+'</div>';
    return '<div class="'+cls+'">'+nfInt.format(r._qty)+'</div>';
  }
  if (c.type === "money"){
    if (r._bad & 2) return '<div class="'+cls+' bad" title="Not a number — counted as 0">'+esc(r[c.key])+'</div>';
    return '<div class="'+cls+' money'+(r._ext<0?" neg":"")+'">'+money(r._ext)+'</div>';
  }
  if (c.key === "Done"){
    if (!r.Done) return '<div class="'+cls+'"><span class="pill no">Not done</span></div>';
    if (r.Done === "Done") return '<div class="'+cls+'"><span class="pill">Done</span></div>';
    return '<div class="'+cls+'"><span class="pill odd">'+esc(r.Done)+'</span></div>';
  }
  var v = r[c.key];
  if (v === "") return '<div class="'+cls+' dim">—</div>';
  return '<div class="'+cls+'" title="'+esc(v)+'">'+esc(v)+'</div>';
}

var scroller = null, rowsEl = null;
export function paintRows(reset){
  if (!scroller){ scroller = document.getElementById("tblScroll"); rowsEl = document.getElementById("rows"); }
  var data = state.filtered;
  if (reset) scroller.scrollTop = 0;
  if (!data.length){
    rowsEl.style.height = "auto";
    rowsEl.innerHTML = '<div class="empty" style="position:relative"><b>No rows match</b>Remove a filter, or clear them all, to see data again.</div>';
    return;
  }
  rowsEl.style.height = (data.length * ROW_H) + "px";
  var headH = document.getElementById("hrow").offsetHeight || 36;
  var top = Math.max(0, scroller.scrollTop - headH);
  var first = Math.max(0, Math.floor(top / ROW_H) - 8);
  var last = Math.min(data.length, first + Math.ceil(scroller.clientHeight / ROW_H) + 16);

  var out = [];
  for (var i = first; i < last; i++){
    var r = data[i];
    out.push('<div class="trow'+(i%2?" alt":"")+'" style="top:'+(i*ROW_H)+'px;height:'+ROW_H+'px;grid-template-columns:'+tpl+'">');
    for (var c = 0; c < COLS.length; c++) out.push(cellHtml(r, COLS[c]));
    out.push('</div>');
  }
  rowsEl.innerHTML = out.join("");
}
export function renderCount(){
  var t = sheet().rows.length, f = state.filtered.length;
  document.getElementById("rowCount").innerHTML =
    "Showing <b>" + nfInt.format(f) + "</b> of " + nfInt.format(t) + " rows" + (anyFilter() ? "" : " (unfiltered)");
}
