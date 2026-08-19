/* Export Plan — 6. Pie breakdown (P/N or Project, by quantity) + the matching
   Project / P/N / Qty / Value in US$ list beside it.
   ------------------------------------------------------------
   Both panels always reflect the *whole* active sheet, in the
   sheet's own row order — independent of the bottom table's
   filters (§7) and of which pie mode is selected. Every distinct
   project/P·N gets its own slice and its own direct label — no
   "N more" bucket. pieState holds the live pie's slices/geometry/
   pick so both directions of the pie↔list link (click a slice ⇄
   click a list row/group) can reach it from either render path. */
import { BLANK } from './columns.js?v=20260819';
import { esc, money, fmtDate, nfInt } from './format.js?v=20260819';
import { state, anyFilter } from './state.js?v=20260819';
import { updateRemarksActionRow } from './remarks-export.js?v=20260819';

var SERIES_COLORS = ["var(--series-1)","var(--series-2)","var(--series-3)","var(--series-4)","var(--series-5)","var(--series-6)","var(--series-7)"];
var PIE_HOVER_GROW = 9;
var pieState = { slices:[], total:0, mode:"pn", pickedIdx:null, geom:null, svg:null, centerVal:null, centerLab:null, caption:null };
function groupByProject(recs){
  var m = new Map();
  recs.forEach(function(r){
    var k = r.projectNo || BLANK;
    var g = m.get(k);
    if (!g){ g = { k:k, qty:0, n:0 }; m.set(k, g); }
    g.n++;
    r.items.forEach(function(it){ g.qty += it.qty || 0; });
  });
  return Array.from(m.values()).sort(function(a,b){ return b.qty - a.qty; });
}
function groupByPN(recs){
  var m = new Map();
  recs.forEach(function(r){
    r.items.forEach(function(it){
      var k = it.pn || BLANK, g = m.get(k);
      if (!g){ g = { k:k, qty:0, n:0 }; m.set(k, g); }
      g.qty += it.qty || 0; g.n++;
    });
  });
  return Array.from(m.values()).sort(function(a,b){ return b.qty - a.qty; });
}
// One color per distinct project, ranked the same way groupByProject ranks
// them by the order each project *first appears* in the sheet — i.e. list
// order, not qty rank — because that's the order groups actually sit
// next to each other in renderPieList. SERIES_COLORS' sequence was
// validated for adjacent-pair CVD separation (see the dataviz palette
// notes), so assigning consecutive slots to consecutive *list* neighbors
// is what actually keeps neighboring groups visually distinct; ranking
// by qty (the old behavior) could put two similarly-ranked, adjacently-
// colored projects right next to each other in the list by coincidence.
// Deliberately independent of the pie's own (qty-ranked) slice colors —
// see EXPORT_PLAN_NOTES.md for why that divergence is fine.
function buildProjectColorMap(recs){
  var order = [], seen = new Set();
  recs.forEach(function(r){
    var k = r.projectNo || BLANK;
    if (!seen.has(k)){ seen.add(k); order.push(k); }
  });
  var map = new Map();
  order.forEach(function(k, i){ map.set(k, SERIES_COLORS[i % SERIES_COLORS.length]); });
  return map;
}
// Every distinct group is its own slice — no top-N cap, no "N more" catch-
// all, so a slice always names one real project or P/N. Colors cycle the
// 7-slot palette past 7 groups (same scheme as buildProjectColorMap).
function pieSlices(recs, mode){
  var groups = mode === "project" ? groupByProject(recs) : groupByPN(recs);
  return groups.map(function(g, i){ return { key:g.k, qty:g.qty, color:SERIES_COLORS[i % SERIES_COLORS.length] }; });
}
function polar(cx, cy, r, ang){ return [cx + r*Math.cos(ang), cy + r*Math.sin(ang)]; }
function annularPath(cx, cy, rOuter, rInner, a0, a1){
  var large = (a1 - a0) > Math.PI ? 1 : 0;
  var p0 = polar(cx, cy, rOuter, a0), p1 = polar(cx, cy, rOuter, a1);
  var p2 = polar(cx, cy, rInner, a1), p3 = polar(cx, cy, rInner, a0);
  return "M"+p0[0]+","+p0[1]+" A"+rOuter+","+rOuter+" 0 "+large+" 1 "+p1[0]+","+p1[1]+
         " L"+p2[0]+","+p2[1]+" A"+rInner+","+rInner+" 0 "+large+" 0 "+p3[0]+","+p3[1]+" Z";
}
function truncateLabel(s, max){ return s.length > max ? s.slice(0, max - 1) + "…" : s; }
// Sum of the *record* value for every record that contributes to a slice —
// counted once per record (not once per P/N line), so a multi-P/N record
// matching a P/N slice on just one of its lines still contributes its
// value exactly once, and a project slice sums each of its records once.
function sliceMoneyTotal(recs, mode, sl){
  var sum = 0;
  recs.forEach(function(r){
    var matches = mode === "project"
      ? (r.projectNo || BLANK) === sl.key
      : r.items.some(function(it){ return (it.pn || BLANK) === sl.key; });
    if (matches) sum += r.value;
  });
  return sum;
}
// Slice-based list highlight — used only when the *pie/buttons side* is
// the one driving it (hover/pick on a wedge or a button); it matches
// every row anywhere in the table sharing that P/N or Project #, which
// is correct there (that's what a slice *is*) but wrong for a table row
// click, which must never highlight a row outside its own group —
// highlightPieListGroup (below), keyed by data-group, is what a list
// click always uses instead.
function highlightPieListSlice(mode, sl){
  var cells = document.querySelectorAll("#epPieList .epsl-cell, #epPieList .epsl-frame");
  cells.forEach(function(c){ c.classList.remove("hl"); });
  if (!sl) return;
  var first = null;
  cells.forEach(function(c){
    var matched = mode === "project"
      ? c.dataset.project === sl.key
      : (c.dataset.pn || "").split("|").indexOf(sl.key) !== -1;
    if (matched){ c.classList.add("hl"); if (!first && c.classList.contains("epsl-cell")) first = c; }
  });
  if (first) first.scrollIntoView({ block:"nearest", behavior:"smooth" });
}
// Group-based list highlight, keyed by data-group rather than by slice —
// this is what a list click always uses (see wireListInteractions), so a
// click only ever marks the clicked row's own group (its consecutive
// same-Project# run) — never a row in a different group that happens to
// share a P/N or Project # with it. For a size-1 group this naturally
// highlights exactly that one row.
function highlightPieListGroup(host, groupId){
  host.querySelectorAll(".epsl-cell, .epsl-frame").forEach(function(c){ c.classList.remove("hl"); });
  if (groupId == null) return;
  var first = null;
  host.querySelectorAll('[data-group="'+groupId+'"]').forEach(function(c){
    c.classList.add("hl");
    if (!first && c.classList.contains("epsl-cell")) first = c;
  });
  if (first) first.scrollIntoView({ block:"nearest", behavior:"smooth" });
}
function pieShowTotal(){
  if (!pieState.centerVal) return;
  pieState.centerVal.textContent = nfInt.format(pieState.total);
  pieState.centerLab.textContent = "total qty";
  if (pieState.caption) pieState.caption.textContent = "";
}
function pieShowSlice(sl){
  if (!pieState.centerVal) return;
  var pct = (sl.qty / pieState.total * 100).toFixed(1);
  var moneyTotal = sliceMoneyTotal(state.filtered, pieState.mode, sl);
  pieState.centerVal.textContent = nfInt.format(sl.qty);
  pieState.centerLab.textContent = pct + "% · " + money(moneyTotal);
  if (pieState.caption) pieState.caption.textContent = truncateLabel(sl.key, 30);
}
function pieSetGrown(idx, grown){
  var path = pieState.svg && pieState.svg.querySelector('path[data-idx="'+idx+'"]');
  if (!path) return;
  var sl = pieState.slices[idx], g = pieState.geom;
  path.setAttribute("d", annularPath(g.cx, g.cy, g.rOuter + (grown ? PIE_HOVER_GROW : 0), g.rInner, sl._a0, sl._a1));
}
// The single "pick" implementation — reached from a pie slice click AND
// from an unambiguous list row/group click (see wireListInteractions), so
// both directions of the pie↔list link stay in sync through one path.
// Toggles the "picked" look on whichever visual(s) represent slice idx —
// the SVG wedge (chart view) and the grid button (buttons view) both
// exist in the DOM at once (only one is `hidden`, see wirePieViewToggle),
// so both are kept in sync regardless of which is currently shown —
// switching views mid-pick doesn't lose the selection's visual state.
function pieSetPickedClass(idx, on){
  var path = pieState.svg && pieState.svg.querySelector('path[data-idx="'+idx+'"]');
  if (path) path.classList.toggle("picked", on);
  var btnHost = document.getElementById("epPieButtons");
  var btn = btnHost && btnHost.querySelector('.eppie-btn[data-idx="'+idx+'"]');
  if (btn) btn.classList.toggle("picked", on);
}
function pieTogglePick(idx){
  if (idx < 0 || idx >= pieState.slices.length) return;
  if (pieState.pickedIdx === idx){
    pieSetPickedClass(idx, false);
    pieState.pickedIdx = null;
    pieShowTotal();
    highlightPieListSlice(pieState.mode, null);
  } else {
    if (pieState.pickedIdx !== null) pieSetPickedClass(pieState.pickedIdx, false);
    pieState.pickedIdx = idx;
    pieSetPickedClass(idx, true);
    pieShowSlice(pieState.slices[idx]);
    highlightPieListSlice(pieState.mode, pieState.slices[idx]);
  }
}
// The donut fills whatever box its column gives it (see .eppie-chart
// svg{width/height:100%} — no viewBox margin is spent on labels anymore:
// a slice's name only ever shows in the caption band reserved below the
// circle (pieShowSlice/pieShowTotal write into #epPieCaption), never next
// to the wedge, so the circle itself gets nearly the whole canvas.
function renderPieChart(slices, total, mode){
  var host = document.getElementById("epPieChart");
  pieState.slices = slices; pieState.total = total; pieState.mode = mode; pieState.pickedIdx = null;
  if (!total){
    host.innerHTML = '<div class="empty"><b>Nothing to chart</b>No quantities in this sheet.</div>';
    pieState.svg = null; pieState.centerVal = null; pieState.centerLab = null; pieState.caption = null; pieState.geom = null;
    return;
  }
  var W = 260, H = 280, cx = 130, cy = 122, rOuter = 104, rInner = 50;
  pieState.geom = { cx:cx, cy:cy, rOuter:rOuter, rInner:rInner };
  var a0 = -Math.PI/2;
  var wedges = [];
  slices.forEach(function(sl, idx){
    var frac = Math.max(0, sl.qty) / total;
    if (frac <= 0) return;
    var a1 = a0 + Math.min(frac, 0.9999) * Math.PI * 2;
    sl._a0 = a0; sl._a1 = a1;
    wedges.push(
      '<path data-idx="'+idx+'" tabindex="0" role="button" aria-label="'+esc(sl.key)+', '+nfInt.format(sl.qty)+', '+(frac*100).toFixed(1)+'%" '+
      'd="'+annularPath(cx, cy, rOuter, rInner, a0, a1)+'" fill="'+sl.color+'" stroke="var(--surface)" stroke-width="2" stroke-linejoin="round">'+
      '<title>'+esc(sl.key)+' · '+nfInt.format(sl.qty)+' ('+(frac*100).toFixed(1)+'%)</title></path>'
    );
    a0 = a1;
  });
  var s = ['<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Quantity breakdown">'];
  s.push(wedges.join(""));
  s.push('<text id="epPieCenterVal" x="'+cx+'" y="'+(cy-3)+'" text-anchor="middle" font-size="25" font-weight="600" fill="var(--ink)">'+nfInt.format(total)+'</text>');
  s.push('<text id="epPieCenterLab" x="'+cx+'" y="'+(cy+17)+'" text-anchor="middle" font-size="11" fill="var(--faint)">total qty</text>');
  s.push('<text id="epPieCaption" x="'+cx+'" y="'+(cy + rOuter + 30)+'" text-anchor="middle" font-size="12.5" fill="var(--ink-2)"></text>');
  s.push("</svg>");
  host.innerHTML = s.join("");

  var svg = host.querySelector("svg");
  pieState.svg = svg;
  pieState.centerVal = svg.querySelector("#epPieCenterVal");
  pieState.centerLab = svg.querySelector("#epPieCenterLab");
  pieState.caption = svg.querySelector("#epPieCaption");
  svg.querySelectorAll("path[data-idx]").forEach(function(path){
    var idx = +path.dataset.idx;
    function preview(){ pieSetGrown(idx, true); if (pieState.pickedIdx === null) pieShowSlice(pieState.slices[idx]); }
    function unpreview(){ pieSetGrown(idx, false); if (pieState.pickedIdx === null) pieShowTotal(); else pieShowSlice(pieState.slices[pieState.pickedIdx]); }
    path.addEventListener("mouseenter", preview);
    path.addEventListener("mouseleave", unpreview);
    path.addEventListener("focus", preview);
    path.addEventListener("blur", unpreview);
    path.addEventListener("click", function(){ pieTogglePick(idx); });
    path.addEventListener("keydown", function(e){ if (e.key === "Enter" || e.key === " "){ e.preventDefault(); pieTogglePick(idx); } });
  });
}
function flattenItems(recs){
  var out = [];
  recs.forEach(function(r){
    var recKey = r._sheet + "|" + r._row;
    if (!r.items.length){
      out.push({ project:r.projectNo, projectName:r.projectName, pn:"", qty:null, shipDate:r.shipDate, value:r.value, remarks:r.remarks, recKey:recKey });
    } else {
      r.items.forEach(function(it){
        out.push({ project:r.projectNo, projectName:r.projectName, pn:it.pn, qty:it.qty, shipDate:r.shipDate, value:r.value, remarks:r.remarks, recKey:recKey });
      });
    }
  });
  return out;
}
// Two levels of grouping. Outer: consecutive rows sharing a project get
// one visible frame (`.epsl-frame`), tinted in its own project color via
// the `--frame-color` custom property — the whole group reads as one
// colored block, including a group of one. Inner: within that, rows that
// came from the very same *source* record (`recKey` — see §4.2, a P/N
// cell can hold several newline-separated part numbers that all share
// one Ship Date/Value) are a sub-group with one shared, merged Value
// cell instead of repeating the same figure on every P/N line. A project
// spanning *several different* source records still shows each record's
// own value — only P/N lines that are genuinely the same record's ever
// merge — and a thin `.epsl-sep` line marks the boundary between two
// sub-groups (never drawn *within* one, since those rows share a figure
// rather than differing).
function renderPieList(recs){
  var host = document.getElementById("epPieList");
  var items = flattenItems(recs);
  if (!items.length){
    host.innerHTML = anyFilter()
      ? '<div class="empty"><b>No rows match</b>Remove a filter, or clear them all, to see rows again.</div>'
      : '<div class="empty"><b>No rows</b>No data in this sheet.</div>';
    updateRemarksActionRow();
    return;
  }
  var colorMap = buildProjectColorMap(recs);
  var out = [], gridRow = 1, i = 0, groupIdx = 0;
  while (i < items.length){
    var j = i;
    while (j + 1 < items.length && items[j+1].project === items[i].project) j++;
    var groupLen = j - i + 1;
    var groupPns = items.slice(i, j + 1).map(function(it){ return it.pn; }).join("|");
    var color = colorMap.get(items[i].project) || "var(--slate)";
    var colorStyle = "--frame-color:" + color;

    var subGroups = [];
    var k = i;
    while (k <= j){
      var m = k;
      while (m + 1 <= j && items[m+1].recKey === items[k].recKey) m++;
      subGroups.push([k, m]);
      k = m + 1;
    }
    var span = groupLen + (subGroups.length - 1); // + one row per inter-subgroup separator
    out.push('<span class="epsl-frame" data-group="'+groupIdx+'" data-project="'+esc(items[i].project)+'" data-pn="'+esc(groupPns)+'" style="grid-row:'+gridRow+' / span '+span+'; grid-column:1/-1; '+colorStyle+'"></span>');

    var row = gridRow;
    subGroups.forEach(function(sg, sgIdx){
      var a = sg[0], b = sg[1], subLen = b - a + 1, subStart = row;
      for (var idx = a; idx <= b; idx++){
        var it = items[idx], r = row + (idx - a);
        var attrs = 'style="grid-row:'+r+'; '+colorStyle+'" data-group="'+groupIdx+'" data-project="'+esc(it.project)+'" data-pn="'+esc(it.pn)+'"';
        out.push(
          '<span class="epsl-cell epsl-proj mono" '+attrs+'>' +
            '<i class="epsl-swatch" style="background:'+color+'"></i>' + esc(it.project || "—") +
          '</span>' +
          '<span class="epsl-cell epsl-pname" '+attrs+'>'+esc(it.projectName || "—")+'</span>' +
          '<span class="epsl-cell epsl-pn mono" '+attrs+'>'+esc(it.pn || "—")+'</span>' +
          '<span class="epsl-cell epsl-qty" '+attrs+'>'+(it.qty==null?"—":nfInt.format(it.qty))+'</span>' +
          '<span class="epsl-cell epsl-date" '+attrs+'>'+(it.shipDate==null?"—":fmtDate(it.shipDate))+'</span>'
        );
      }
      var first = items[a], subPns = items.slice(a, b + 1).map(function(it){ return it.pn; }).join("|");
      var mergedAttrs = 'style="grid-row:'+subStart+' / span '+subLen+'; '+colorStyle+'" data-group="'+groupIdx+'" data-project="'+esc(first.project)+'" data-pn="'+esc(subPns)+'"';
      out.push(
        '<span class="epsl-cell epsl-val'+(first.value<0?" neg":"")+(subLen>1?" merged":"")+'" '+mergedAttrs+'>'+money(first.value)+'</span>'
      );
      // Remarks belongs to the whole source record (§4.2), same as Value —
      // one merged, editable cell per sub-group rather than one per P/N
      // line, so editing it once can never leave a multi-P/N record's
      // several rendered lines showing conflicting text for what is really
      // a single underlying cell.
      var recKey = first.recKey;
      var origRemarks = first.remarks || "";
      var remarksVal = state.remarksEdits.has(recKey) ? state.remarksEdits.get(recKey) : origRemarks;
      var remarksEdited = state.remarksEdits.has(recKey);
      out.push(
        '<span class="epsl-cell epsl-remarks'+(subLen>1?" merged":"")+(remarksEdited?" edited":"")+'" '+mergedAttrs+'>' +
          '<textarea class="epsl-remarks-input" rows="1" placeholder="Add a remark…" ' +
            'data-reckey="'+esc(recKey)+'" data-orig="'+esc(origRemarks)+'">'+esc(remarksVal)+'</textarea>' +
        '</span>'
      );
      row += subLen;
      if (sgIdx < subGroups.length - 1){
        out.push('<span class="epsl-sep" style="grid-row:'+row+'; '+colorStyle+'"></span>');
        row += 1;
      }
    });

    gridRow += span;
    groupIdx++;
    i = j + 1;
    if (i < items.length){
      out.push('<span class="epsl-gap" style="grid-row:'+gridRow+'"></span>');
      gridRow += 1;
    }
  }
  host.innerHTML = out.join("");
  wireListInteractions(host);
  wireRemarksEditing(host);
  updateRemarksActionRow();
}
function autoGrowRemarksInput(ta){
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}
// Every Remarks textarea updates state.remarksEdits directly on "input" —
// deliberately never triggers a re-render (render() rebuilds this whole
// list's innerHTML, which would drop keystrokes mid-typing by yanking
// focus out from under the user). The Download button's visibility is
// kept in sync the same way, via updateRemarksActionRow() rather than a
// full render.
function wireRemarksEditing(host){
  host.querySelectorAll(".epsl-remarks-input").forEach(function(ta){
    autoGrowRemarksInput(ta);
    // A click/mousedown inside the textarea would otherwise bubble up to
    // the .epsl-cell click handler below and toggle the group highlight
    // every time someone places a cursor to edit — stop it here so editing
    // and group-picking stay two separate gestures.
    ta.addEventListener("mousedown", function(e){ e.stopPropagation(); });
    ta.addEventListener("click", function(e){ e.stopPropagation(); });
    ta.addEventListener("input", function(){
      autoGrowRemarksInput(ta);
      var recKey = ta.dataset.reckey, orig = ta.dataset.orig || "";
      if (ta.value === orig) state.remarksEdits.delete(recKey);
      else state.remarksEdits.set(recKey, ta.value);
      var cell = ta.closest(".epsl-remarks");
      if (cell) cell.classList.toggle("edited", state.remarksEdits.has(recKey));
      updateRemarksActionRow();
    });
  });
}
function wireListInteractions(host){
  host.querySelectorAll("[data-group]").forEach(function(el){
    var g = el.dataset.group;
    el.addEventListener("mouseenter", function(){
      host.querySelectorAll('[data-group="'+g+'"]').forEach(function(x){ x.classList.add("grouphover"); });
    });
    el.addEventListener("mouseleave", function(){
      host.querySelectorAll('[data-group="'+g+'"]').forEach(function(x){ x.classList.remove("grouphover"); });
    });
  });
  // A click always marks exactly the clicked row's own group (its
  // consecutive same-Project# run, data-group) — never anything outside
  // it. This used to route through pieTogglePick/highlightPieListSlice
  // whenever the click unambiguously mapped to one pie slice (Project
  // mode always; P/N mode for a size-1 group), on the theory that doing
  // so "happens to produce the identical highlight" — false in general:
  // a slice matches *every* row sharing that P/N or Project # anywhere
  // in the table, including rows in a completely different group that
  // simply happen to reuse the same P/N (a real, common case — the same
  // part number ordered under two unrelated projects). Always going
  // through the group-based path here fixes that: it only ever matches
  // `data-group`, so a click can never highlight a row outside the
  // clicked row's own group, regardless of P/N/Project mode or group
  // size. The pie/buttons panel itself is unaffected — hovering or
  // clicking a slice there still legitimately highlights every matching
  // row across the whole table, since that's what a slice *is*.
  host.querySelectorAll(".epsl-cell").forEach(function(c){
    c.addEventListener("click", function(){
      var groupId = c.dataset.group;
      var alreadyOn = host.querySelector('.epsl-cell[data-group="'+groupId+'"].hl') !== null;
      if (pieState.pickedIdx !== null) pieTogglePick(pieState.pickedIdx);
      highlightPieListGroup(host, alreadyOn ? null : groupId);
    });
  });
}
// Alternative to the donut for the same slices — one button per group,
// 5 to a row (fewer on narrow screens, see CSS), scrolling if there are
// more than fit. Each button is unambiguously one slice (unlike a list
// click, a button never represents "a whole multi-P/N group"), so a
// click always just picks it via the same pieTogglePick the chart uses.
function renderPieButtons(slices){
  var host = document.getElementById("epPieButtons");
  if (!slices.length){
    host.innerHTML = '<div class="empty"><b>Nothing to show</b>No quantities in this sheet.</div>';
    return;
  }
  host.innerHTML = slices.map(function(sl, idx){
    return '<button type="button" class="eppie-btn" data-idx="'+idx+'" style="--frame-color:'+sl.color+'" title="'+esc(sl.key)+'">'+
      '<i></i><span>'+esc(sl.key)+'</span></button>';
  }).join("");
  host.querySelectorAll(".eppie-btn").forEach(function(b){
    b.addEventListener("click", function(){ pieTogglePick(+b.dataset.idx); });
  });
}
export function renderPie(){
  // The currently filtered set (state.filtered, ship-date sorted — see
  // recompute) — the table, chart and buttons all react to the same
  // filters as the KPI band above them now that the filter bar lives in
  // this block instead of driving a separate bottom table.
  var recs = state.filtered;
  renderPieList(recs);
  var slices = pieSlices(recs, state.pieMode);
  var total = slices.reduce(function(s, x){ return s + Math.max(0, x.qty); }, 0);
  renderPieChart(slices, total, state.pieMode);
  renderPieButtons(slices);
}
function wirePieToggle(){
  var box = document.getElementById("epPieToggle");
  box.querySelectorAll("button").forEach(function(b){
    b.addEventListener("click", function(){
      if (b.dataset.mode === state.pieMode) return;
      state.pieMode = b.dataset.mode;
      box.querySelectorAll("button").forEach(function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      renderPie();
    });
  });
}
wirePieToggle();
// Chart vs Buttons is purely a display choice — both are always rendered
// (renderPie renders both every time), this just shows one and hides the
// other, so switching views never needs a re-render or loses pick state.
function wirePieViewToggle(){
  var box = document.getElementById("epPieViewToggle");
  var views = { chart: document.getElementById("epPieChart"), buttons: document.getElementById("epPieButtons") };
  box.querySelectorAll("button").forEach(function(b){
    b.addEventListener("click", function(){
      if (b.getAttribute("aria-pressed") === "true") return;
      box.querySelectorAll("button").forEach(function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      var view = b.dataset.view;
      Object.keys(views).forEach(function(k){ views[k].hidden = k !== view; });
    });
  });
}
wirePieViewToggle();
