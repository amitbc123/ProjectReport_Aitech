/* Project Report — 9. Filter bar */
import { BLANK } from './columns.js?v=20260813';
import { esc, nfInt, parseDMY } from './format.js?v=20260813';
import { state } from './state.js?v=20260813';
import { FILTER_COLS } from './filters.js?v=20260813';
import { render } from './render.js?v=20260813';

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

function cid(k){ return k.replace(/[^a-z0-9]/gi,"_"); }

export function renderFilterBar(){
  var g = document.getElementById("fgrid");
  g.innerHTML = "";
  FILTER_COLS.forEach(function(c){
    var f = document.createElement("div");
    f.className = "field";
    f.innerHTML =
      '<label id="lbl-'+cid(c.key)+'">'+esc(c.label)+'</label>'+
      '<div class="cb" data-cb="'+esc(c.key)+'">'+
        '<input type="text" placeholder="All" role="combobox" aria-expanded="false" '+
               'aria-autocomplete="list" aria-labelledby="lbl-'+cid(c.key)+'" autocomplete="off">'+
        '<span class="badge" hidden>0</span><span class="caret">▾</span>'+
      '</div>'+
      '<div class="pop" hidden>'+
        '<div class="popbar"><button type="button" data-act="all">Select all</button>'+
        '<button type="button" data-act="none">Clear</button></div>'+
        '<div class="popbody" role="listbox"></div>'+
      '</div>';
    g.appendChild(f);
    wireCombo(f, c);
  });
}

function wireCombo(field, col){
  var box   = field.querySelector(".cb");
  var input = field.querySelector("input");
  var pop   = field.querySelector(".pop");
  var body  = field.querySelector(".popbody");
  var btnAll  = field.querySelector('[data-act="all"]');
  var btnNone = field.querySelector('[data-act="none"]');
  var cursor = -1, lastOpts = [];

  function options(){
    var m = state.facets[col.key] || new Map();
    var q = input.value.trim().toLowerCase();
    var arr = [];
    m.forEach(function(n,v){ if (!q || v.toLowerCase().indexOf(q) !== -1) arr.push([v,n]); });
    var sel = state.filters[col.key];
    if (sel) sel.forEach(function(v){
      if (!m.has(v) && (!q || v.toLowerCase().indexOf(q) !== -1)) arr.push([v,0]);
    });
    if (col.type === "date") {
      arr.sort(function(a,b){
        var x = parseDMY(a[0]), y = parseDMY(b[0]);
        if (x === null) return 1;
        if (y === null) return -1;
        return y - x;                                 // newest first
      });
    } else {
      arr.sort(function(a,b){ return b[1]-a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0); });
    }
    return arr;
  }
  function paint(){
    lastOpts = options();
    var sel = state.filters[col.key];
    btnAll.textContent  = "Select all" + (lastOpts.length ? " (" + nfInt.format(lastOpts.length) + ")" : "");
    btnAll.disabled = !lastOpts.length;
    btnNone.hidden = !(sel && sel.size);
    if (!lastOpts.length){ body.innerHTML = '<div class="none">No matching values</div>'; return; }
    body.innerHTML = lastOpts.slice(0,250).map(function(o,i){
      var on = sel && sel.has(o[0]);
      return '<div class="opt'+(o[0]===BLANK?" blank":"")+(i===cursor?" cursor":"")+'" role="option" '+
             'aria-selected="'+(on?"true":"false")+'" data-v="'+esc(o[0])+'">'+
             '<span class="tick">✓</span><span class="t">'+esc(o[0])+'</span>'+
             '<span class="n">'+nfInt.format(o[1])+'</span></div>';
    }).join("") + (lastOpts.length>250 ? '<div class="none">'+nfInt.format(lastOpts.length-250)+' more — keep typing to narrow</div>' : "");
  }
  function open(){
    if (openPop && openPop !== pop) openPop.hidden = true;
    openPop = pop; pop.hidden = false;
    input.setAttribute("aria-expanded","true");
    paint();
  }
  function close(){
    pop.hidden = true; input.setAttribute("aria-expanded","false"); cursor = -1;
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
      if (t) toggle(col.key, t.dataset.v);
    } else if (e.key === "Escape"){ close(); input.blur(); }
    else if (e.key === "Backspace" && input.value === "" && state.filters[col.key] && state.filters[col.key].size){
      toggle(col.key, Array.from(state.filters[col.key]).pop());
    }
  });
  body.addEventListener("mousedown", function(e){
    var o = e.target.closest(".opt");
    if (!o) return;
    e.preventDefault();
    toggle(col.key, o.dataset.v);
  });
  btnAll.addEventListener("mousedown", function(e){
    e.preventDefault();
    if (!lastOpts.length) return;
    var s = state.filters[col.key] || new Set();
    lastOpts.forEach(function(o){ s.add(o[0]); });
    state.filters[col.key] = s;
    render();
  });
  btnNone.addEventListener("mousedown", function(e){
    e.preventDefault();
    delete state.filters[col.key];
    render();
  });
  input.addEventListener("blur", function(){
    setTimeout(function(){ if (!pop.contains(document.activeElement)) close(); }, 120);
  });

  field._refresh = function(){
    var sel = state.filters[col.key];
    var n = sel ? sel.size : 0;
    var badge = field.querySelector(".badge");
    badge.hidden = !n; badge.textContent = n;
    box.classList.toggle("active", !!n);
    input.placeholder = n ? (n === 1 ? Array.from(sel)[0] : n + " selected") : "";
    if (!pop.hidden) paint();
  };
}

function toggle(key, value){
  if (!state.filters[key]) state.filters[key] = new Set();
  var s = state.filters[key];
  if (s.has(value)) s.delete(value); else s.add(value);
  if (!s.size) delete state.filters[key];
  render();
}
export function setOnly(key, value){ state.filters[key] = new Set([value]); render(); }

export function renderChips(){
  var box = document.getElementById("chips"), out = [];
  FILTER_COLS.forEach(function(c){
    var s = state.filters[c.key];
    if (!s) return;
    s.forEach(function(v){
      out.push('<span class="chip"><b>'+esc(c.label)+'</b> '+esc(v)+
        '<button aria-label="Remove filter" data-k="'+esc(c.key)+'" data-v="'+esc(v)+'">×</button></span>');
    });
  });
  if (state.period) {
    out.push('<span class="chip"><b>Period</b> '+esc(state.period.label)+
      '<button aria-label="Remove period filter" data-p="1">×</button></span>');
  }
  box.innerHTML = out.join("");
  box.querySelectorAll("button").forEach(function(b){
    b.addEventListener("click", function(){
      if (b.dataset.p) { state.period = null; render(); }
      else toggle(b.dataset.k, b.dataset.v);
    });
  });
  document.querySelectorAll(".field").forEach(function(f){ if (f._refresh) f._refresh(); });
  var mfCount = document.getElementById("mfCount");
  mfCount.hidden = !out.length;
  mfCount.textContent = out.length;
  document.getElementById("mfToggle").classList.toggle("hasFilters", !!out.length);
}
