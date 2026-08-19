/* Export Plan — 11. File intake */
import { esc, nfInt } from './format.js?v=20260819';
import { state } from './state.js?v=20260819';
import { parseExportWorkbook } from './rows.js?v=20260819';
import { switchSheet, render } from './render.js?v=20260819';
import { renderCardFilterBar, closeOpenPopup } from './filter-bar.js?v=20260819';
import { epCacheFile } from './idb-store.js?v=20260819';

var epDropscreen = document.getElementById("epDropscreen");
var epLoading    = document.getElementById("epLoading");
var epDash       = document.getElementById("epDash");
var epTopbar     = document.getElementById("epTop");
var epDz         = document.getElementById("epDropzone");
var epErrBox     = document.getElementById("epDropErr");
var epHadData    = false;

function epShowError(kind, extra){
  var msg;
  if (kind === "NO_SHEETS") msg = "<b>No usable worksheets found.</b><br>Expected at least one sheet with <span class='mono'>Project #</span> and <span class='mono'>P/N</span> columns.";
  else if (kind === "NO_XLSX") msg = "<b>Excel reader unavailable.</b><br>Try reloading the page.";
  else msg = "<b>Could not read the file.</b><br>"+esc(String(extra || ""));
  epLoading.hidden = true;
  if (epHadData){ epDash.hidden = false; epTopbar.hidden = false; epDropscreen.hidden = true; epToast(msg); }
  else { epErrBox.innerHTML = '<div class="err">'+msg+'</div>'; epDropscreen.hidden = false; }
}
export function epToast(msg, kind){
  var old = document.getElementById("toast");
  if (old) old.remove();
  var t = document.createElement("div");
  t.id = "toast";
  var cls = kind === "info" ? "tmsg" : "err";
  t.innerHTML = '<div class="'+cls+'" style="margin:0">'+msg+'</div><button class="btn ghost" aria-label="Dismiss">Dismiss</button>';
  document.body.appendChild(t);
  t.querySelector("button").addEventListener("click", function(){ t.remove(); });
}
function epSetProgress(p, label){
  document.getElementById("epProgBar").style.width = Math.round(p*100) + "%";
  document.getElementById("epProgPct").textContent = Math.round(p*100) + "%";
  if (label) document.getElementById("epProgText").textContent = label;
}
function epInstall(file, u8, parsed){
  state.fileName = file.name;
  state.originalBytes = u8;
  state.wb = parsed.wb;
  state.sheetName = parsed.sheetName;
  state.remarksCol = parsed.remarksCol;
  state.remarksEdits = new Map();
  epSetProgress(1, "Building the dashboard…");
  setTimeout(function(){
    epHadData = true;
    epDropscreen.hidden = true; epLoading.hidden = true;
    epDash.hidden = false; epTopbar.hidden = false;
    document.getElementById("epFilemeta").innerHTML =
      '<span class="mono">'+esc(file.name)+'</span><span class="dot"></span>'+
      '<span>'+esc(parsed.sheet.name)+'</span><span class="dot"></span>'+
      nfInt.format(parsed.sheet.rows.length)+' rows'+
      (parsed.remarksCol != null ? '<span class="dot"></span><span>Remarks are editable</span>' : '');
    renderCardFilterBar();
    switchSheet(parsed.sheet);
    epCacheFile(file);
  }, 30);
}
export function epHandleFile(file){
  if (!file) return;
  epErrBox.innerHTML = "";
  epDropscreen.hidden = true; epDash.hidden = true; epTopbar.hidden = true;
  epLoading.hidden = false;
  epSetProgress(0, "Reading " + file.name + "…");

  var fr = new FileReader();
  fr.onprogress = function(e){ if (e.lengthComputable) epSetProgress(e.loaded/e.total * 0.35); };
  fr.onerror = function(){ epShowError("READ", "The file could not be opened."); };
  fr.onload = function(){
    var u8 = new Uint8Array(fr.result);
    epSetProgress(0.4, "Reading the Excel workbook…");
    setTimeout(function(){
      try { epInstall(file, u8, parseExportWorkbook(u8)); }
      catch (err){ epShowError(err.message, err.message); }
    }, 40);
  };
  fr.readAsArrayBuffer(file);
}

var epFileInput = document.getElementById("epFileInput");
epFileInput.addEventListener("click", function(){ this.value = ""; });
epFileInput.addEventListener("change", function(e){ if (e.target.files[0]) epHandleFile(e.target.files[0]); });

["dragenter","dragover"].forEach(function(ev){ epDz.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); epDz.classList.add("over"); }); });
["dragleave"].forEach(function(ev){ epDz.addEventListener(ev, function(e){ e.preventDefault(); epDz.classList.remove("over"); }); });
epDz.addEventListener("drop", function(e){
  e.preventDefault(); e.stopPropagation();
  epDz.classList.remove("over");
  var f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) epHandleFile(f);
});
// The Project Report module has its own unconditional window-level drop
// handler (dropping anywhere loads a file into it). That listener runs in
// the bubble phase, so intercepting drops here in the capture phase —
// only while this page is the active one — stops a drop meant for Export
// Plan from also being force-fed into the other, hidden page.
function epPageActive(){ var p = document.getElementById("page-export"); return p && !p.hidden; }
window.addEventListener("drop", function(e){
  if (!epPageActive()) return;
  e.preventDefault(); e.stopPropagation();
  var f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) epHandleFile(f);
}, true);

// Only the pie/buttons visualization (with its P/N↔Project and Chart↔
// Buttons toggles) is collapsed by default — the filter bar and the full
// table are always visible. A click on this button in the KPI row reveals
// the visualization, right next to the KPI cards it summarizes. render()
// keeps populating it even while hidden, so it's ready to show the
// instant it's revealed.
// The table has no fixed height / internal scrollbar of its own by
// default — it grows with its content and the page is the only thing
// that scrolls. Opening the viz panel (#epDash.vizOpen, see CSS) puts
// the table back in its bounded, internally-scrolling box instead, so
// the page doesn't grow to "table's full height + chart/buttons" tall.
var epToggleViewBtn = document.getElementById("epToggleViewBtn");
var epViewBlock = document.getElementById("epViewBlock");
epToggleViewBtn.addEventListener("click", function(){
  var show = epViewBlock.hidden;
  epViewBlock.hidden = !show;
  epToggleViewBtn.setAttribute("aria-expanded", show ? "true" : "false");
  epDash.classList.toggle("vizOpen", show);
});

/* ---------- mobile status/KPI band (collapsed by default) ---------- */
var epKpiBand = document.getElementById("epKpis");
var epKpiToggle = document.getElementById("epKpiToggle");
epKpiToggle.addEventListener("click", function(){
  var open = !epKpiBand.classList.contains("mExpanded");
  epKpiBand.classList.toggle("mExpanded", open);
  epKpiToggle.setAttribute("aria-expanded", open ? "true" : "false");
});

/* ---------- filter bar (Table/Chart/Buttons block): clear-all + mobile drawer ---------- */
document.getElementById("epCardClearAll").addEventListener("click", function(){ state.filters = {}; render(); });
var epCardFiltersSection = document.getElementById("epCardFiltersSection");
var epCardMfToggle = document.getElementById("epCardMfToggle");
epCardMfToggle.addEventListener("click", function(){
  var open = !epCardFiltersSection.classList.contains("mExpanded");
  epCardFiltersSection.classList.toggle("mExpanded", open);
  epCardMfToggle.setAttribute("aria-expanded", open ? "true" : "false");
});
document.addEventListener("click", function(e){
  if (epCardFiltersSection.classList.contains("mExpanded") && !e.target.closest("#epCardFiltersSection")) {
    epCardFiltersSection.classList.remove("mExpanded");
    epCardMfToggle.setAttribute("aria-expanded", "false");
  }
  closeOpenPopup(e.target);
});

function epSyncHeaderHeight(){
  document.documentElement.style.setProperty("--epHeaderH", epTopbar.offsetHeight + "px");
}
new ResizeObserver(epSyncHeaderHeight).observe(epTopbar);
window.addEventListener("resize", epSyncHeaderHeight);
epSyncHeaderHeight();

// The filter bar is sticky right under the KPI band (see
// #page-export #epCardFiltersSection in the CSS), so it also needs the
// band's *real* height, not a guessed constant — the band reflows at the
// 1180/640px breakpoints and its own reveal button can wrap onto a
// second line on narrow widths.
var epKpis = document.getElementById("epKpis");
function epSyncKpisHeight(){
  document.documentElement.style.setProperty("--epKpisH", epKpis.offsetHeight + "px");
}
new ResizeObserver(epSyncKpisHeight).observe(epKpis);
window.addEventListener("resize", epSyncKpisHeight);
epSyncKpisHeight();
