/* Export Plan — 7. Filter bar for the Table/Chart/Buttons block
   ------------------------------------------------------------
   Mirrors the Project Report combobox component (same .cb/.pop/
   .opt/.chips CSS, `epCard`-prefixed element ids kept from when
   this filtered a separate card list). Filtering here touches
   state.filters/state.filtered, which now feed the KPI band and
   every one of the table/chart/buttons views (§6). */
import { BLANK } from './columns.js?v=20260819';
import { esc, nfInt } from './format.js?v=20260819';
import { state, FILTER_COLS } from './state.js?v=20260819';
import { render } from './render.js?v=20260819';

var openPop = null;

// Closes whichever combobox popup is open, unless the click target is
// inside a .field (used by file-intake.js's document-level click handler,
// which previously reached into this module's `openPop` variable directly
// — that's not possible across an ES module boundary, so this wraps the
// same behavior as an exported function instead).
export function closeOpenPopup(target){
  if (openPop && (!target || !target.closest(".field"))) {
    openPop.hidden = true;
    openPop = null;
  }
}

function cid(k){ return "epcard_" + k.replace(/[^a-z0-9]/gi, "_"); }
export function renderCardFilterBar(){
  var g = document.getElementById("epCardFgrid");
  g.innerHTML = "";
  FILTER_COLS.forEach(function(c){
    var f = document.createElement("div");
    f.className = "field";
    f.innerHTML =
      '<label id="'+cid(c.key)+'">'+esc(c.label)+'</label>'+
      '<div class="cb" data-cb="'+esc(c.key)+'">'+
        '<input type="text" placeholder="All" role="combobox" aria-expanded="false" '+
               'aria-autocomplete="list" aria-labelledby="'+cid(c.key)+'" autocomplete="off">'+
        '<span class="badge" hidden>0</span><span class="caret">▾</span>'+
      '</div>'+
      '<div class="pop" hidden>'+
        '<div class="popbar"><button type="button" data-act="all">Select all</button>'+
        '<button type="button" data-act="none">Clear</button></div>'+
        '<div class="popbody" role="listbox"></div>'+
      '</div>';
    g.appendChild(f);
    wireCardCombo(f, c);
  });
}
function wireCardCombo(field, col){
  var box = field.querySelector(".cb"), input = field.querySelector("input"), pop = field.querySelector(".pop");
  var body = field.querySelector(".popbody"), btnAll = field.querySelector('[data-act="all"]'), btnNone = field.querySelector('[data-act="none"]');
  var cursor = -1, lastOpts = [];
  function options(){
    var m = state.facets[col.key] || new Map();
    var q = input.value.trim().toLowerCase();
    var arr = [];
    m.forEach(function(n, v){ if (!q || v.toLowerCase().indexOf(q) !== -1) arr.push([v, n]); });
    var sel = state.filters[col.key];
    if (sel) sel.forEach(function(v){ if (!m.has(v) && (!q || v.toLowerCase().indexOf(q) !== -1)) arr.push([v, 0]); });
    arr.sort(function(a, b){ return b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0); });
    return arr;
  }
  function paint(){
    lastOpts = options();
    var sel = state.filters[col.key];
    btnAll.textContent = "Select all" + (lastOpts.length ? " (" + nfInt.format(lastOpts.length) + ")" : "");
    btnAll.disabled = !lastOpts.length;
    btnNone.hidden = !(sel && sel.size);
    if (!lastOpts.length){ body.innerHTML = '<div class="none">No matching values</div>'; return; }
    body.innerHTML = lastOpts.slice(0, 250).map(function(o, i){
      var on = sel && sel.has(o[0]);
      return '<div class="opt'+(o[0]===BLANK?" blank":"")+(i===cursor?" cursor":"")+'" role="option" '+
             'aria-selected="'+(on?"true":"false")+'" data-v="'+esc(o[0])+'">'+
             '<span class="tick">✓</span><span class="t">'+esc(o[0])+'</span>'+
             '<span class="n">'+nfInt.format(o[1])+'</span></div>';
    }).join("") + (lastOpts.length > 250 ? '<div class="none">'+nfInt.format(lastOpts.length-250)+' more — keep typing to narrow</div>' : "");
  }
  function open(){
    if (openPop && openPop !== pop) openPop.hidden = true;
    openPop = pop; pop.hidden = false; input.setAttribute("aria-expanded", "true"); paint();
  }
  function close(){
    pop.hidden = true; input.setAttribute("aria-expanded", "false"); cursor = -1;
    if (openPop === pop) openPop = null;
  }
  box.addEventListener("click", function(){ input.focus(); open(); });
  input.addEventListener("input", function(){ cursor = -1; open(); });
  input.addEventListener("keydown", function(e){
    var opts = body.querySelectorAll(".opt");
    if (e.key === "ArrowDown" || e.key === "ArrowUp"){
      e.preventDefault();
      if (pop.hidden) { open(); return; }
      cursor += e.key === "ArrowDown" ? 1 : -1;
      if (cursor < 0) cursor = opts.length - 1;
      if (cursor >= opts.length) cursor = 0;
      paint();
      var el = body.querySelectorAll(".opt")[cursor];
      if (el) el.scrollIntoView({ block:"nearest" });
    } else if (e.key === "Enter"){
      e.preventDefault();
      var t = opts[cursor < 0 ? 0 : cursor];
      if (t) toggleFilter(col.key, t.dataset.v);
    } else if (e.key === "Escape"){ close(); input.blur(); }
    else if (e.key === "Backspace" && input.value === "" && state.filters[col.key] && state.filters[col.key].size){
      toggleFilter(col.key, Array.from(state.filters[col.key]).pop());
    }
  });
  body.addEventListener("mousedown", function(e){
    var o = e.target.closest(".opt");
    if (!o) return;
    e.preventDefault();
    toggleFilter(col.key, o.dataset.v);
  });
  btnAll.addEventListener("mousedown", function(e){
    e.preventDefault();
    if (!lastOpts.length) return;
    var s = state.filters[col.key] || new Set();
    lastOpts.forEach(function(o){ s.add(o[0]); });
    state.filters[col.key] = s;
    render();
  });
  btnNone.addEventListener("mousedown", function(e){ e.preventDefault(); delete state.filters[col.key]; render(); });
  input.addEventListener("blur", function(){ setTimeout(function(){ if (!pop.contains(document.activeElement)) close(); }, 120); });
  field._refresh = function(){
    var sel = state.filters[col.key], n = sel ? sel.size : 0;
    var badge = field.querySelector(".badge");
    badge.hidden = !n; badge.textContent = n;
    box.classList.toggle("active", !!n);
    input.placeholder = n ? (n === 1 ? Array.from(sel)[0] : n + " selected") : "";
    if (!pop.hidden) paint();
  };
}
function toggleFilter(key, value){
  if (!state.filters[key]) state.filters[key] = new Set();
  var s = state.filters[key];
  if (s.has(value)) s.delete(value); else s.add(value);
  if (!s.size) delete state.filters[key];
  render();
}
export function renderCardChips(){
  var box = document.getElementById("epCardChips"), out = [];
  FILTER_COLS.forEach(function(c){
    var s = state.filters[c.key];
    if (!s) return;
    s.forEach(function(v){
      out.push('<span class="chip"><b>'+esc(c.label)+'</b> '+esc(v)+
        '<button aria-label="Remove filter" data-k="'+esc(c.key)+'" data-v="'+esc(v)+'">×</button></span>');
    });
  });
  box.innerHTML = out.join("");
  box.querySelectorAll("button").forEach(function(b){
    b.addEventListener("click", function(){ toggleFilter(b.dataset.k, b.dataset.v); });
  });
  document.querySelectorAll("#epCardFgrid .field").forEach(function(f){ if (f._refresh) f._refresh(); });
  var mfCount = document.getElementById("epCardMfCount");
  mfCount.hidden = !out.length; mfCount.textContent = out.length;
  document.getElementById("epCardMfToggle").classList.toggle("hasFilters", !!out.length);
}
