/* Project Report — 16. File intake */
import { SHEET_ORDER } from './columns.js?v=20260813';
import { esc, nfInt } from './format.js?v=20260813';
import { state } from './state.js?v=20260813';
import { parseSpreadsheetML } from './parse-xml.js?v=20260813';
import { parseExcelBinary } from './parse-xlsx.js?v=20260813';
import { switchSheet, render } from './render.js?v=20260813';
import { renderFilterBar, closeOpenPopup } from './filter-bar.js?v=20260813';
import { paintRows } from './table.js?v=20260813';
import { cacheFile } from './folder-autoload.js?v=20260813';

var dropscreen = document.getElementById("dropscreen");
var loading    = document.getElementById("loading");
var dash       = document.getElementById("dash");
var topbar     = document.getElementById("top");
var dz         = document.getElementById("dropzone");
var errBox     = document.getElementById("dropErr");
var hadData    = false;

function showError(kind, extra){
  var msg;
  if (kind === "NOT_SPREADSHEETML")
    msg = "<b>Unrecognised file.</b><br>Expected an Excel workbook (<span class='mono'>.xlsx</span> / <span class='mono'>.xls</span>) or an <span class='mono'>XML Spreadsheet 2003</span> export.";
  else if (kind === "NO_SHEETS")
    msg = "<b>No worksheets found.</b><br>Expected <span class='mono'>Open Projects Report</span> and <span class='mono'>Closed Projects Report</span>.";
  else if (kind === "MISSING_COLS")
    msg = "<b>Missing columns in “"+esc(extra.sheet)+"”.</b><br>Expected these headers on row 1: <span class='mono'>"+extra.cols.map(esc).join(", ")+"</span>.";
  else if (kind === "NO_XLSX")
    msg = "<b>Excel reader unavailable.</b><br>Re-save the report as <span class='mono'>XML Spreadsheet 2003 (*.xml)</span>.";
  else
    msg = "<b>Could not read the file.</b><br>"+esc(String(extra || ""));
  loading.hidden = true;
  if (hadData){
    dash.hidden = false; topbar.hidden = false; dropscreen.hidden = true;
    toast(msg);
  } else {
    errBox.innerHTML = '<div class="err">'+msg+'</div>';
    dropscreen.hidden = false;
  }
}
export function toast(msg, kind){
  var old = document.getElementById("toast");
  if (old) old.remove();
  var t = document.createElement("div");
  t.id = "toast";
  var cls = kind === "info" ? "tmsg" : "err";
  t.innerHTML = '<div class="'+cls+'" style="margin:0">'+msg+'</div><button class="btn ghost" aria-label="Dismiss">Dismiss</button>';
  document.body.appendChild(t);
  t.querySelector("button").addEventListener("click", function(){ t.remove(); });
}
function setProgress(p, label){
  document.getElementById("progBar").style.width = Math.round(p*100) + "%";
  document.getElementById("progPct").textContent = Math.round(p*100) + "%";
  if (label) document.getElementById("progText").textContent = label;
}

function install(file, sheets){
  var byName = {};
  sheets.forEach(function(s){ byName[s.name] = s; });
  var ordered = SHEET_ORDER.filter(function(n){ return byName[n]; }).map(function(n){ return byName[n]; });
  if (!ordered.length) ordered = sheets;
  if (!ordered.length) return showError("NO_SHEETS");

  state.fileName = file.name;
  state.sheets = ordered;
  setProgress(1, "Building the dashboard…");
  setTimeout(function(){
    hadData = true;
    dropscreen.hidden = true; loading.hidden = true;
    dash.hidden = false; topbar.hidden = false;
    document.getElementById("filemeta").innerHTML =
      '<span class="mono">'+esc(file.name)+'</span><span class="dot"></span>'+
      nfInt.format(ordered.reduce(function(s,x){ return s + x.rows.length; },0))+' rows<span class="dot"></span><span>read-only</span>';
    renderFilterBar();
    switchSheet(0);
    cacheFile(file);
  }, 30);
}

export function handleFile(file){
  errBox.innerHTML = "";
  dropscreen.hidden = true; dash.hidden = true; topbar.hidden = true;
  loading.hidden = false;
  setProgress(0, "Reading " + file.name + "…");

  var fr = new FileReader();
  fr.onprogress = function(e){ if (e.lengthComputable) setProgress(e.loaded/e.total * 0.35); };
  fr.onerror = function(){ showError("READ", "The file could not be opened."); };
  fr.onload = function(){
    var u8 = new Uint8Array(fr.result);
    var isZip = u8[0] === 0x50 && u8[1] === 0x4B;                       // .xlsx / .xlsm
    var isOle = u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11;     // legacy .xls

    if (isZip || isOle) {
      setProgress(0.4, "Reading the Excel workbook…");
      setTimeout(function(){
        try { install(file, parseExcelBinary(u8)); }
        catch (err){ if (err.message === "MISSING_COLS") showError("MISSING_COLS", err); else showError(err.message, err.message); }
      }, 40);
      return;
    }
    var text;
    if (u8[0] === 0xFF && u8[1] === 0xFE) text = new TextDecoder("utf-16le").decode(u8);
    else text = new TextDecoder("utf-8").decode(u8);

    if (text.indexOf("<Workbook") === -1 || text.indexOf("urn:schemas-microsoft-com:office:spreadsheet") === -1)
      return showError("NOT_SPREADSHEETML");

    setProgress(0.35, "Parsing worksheets…");
    parseSpreadsheetML(text, function(p){ setProgress(0.35 + p*0.6); })
      .then(function(sheets){ install(file, sheets); })
      .catch(function(err){
        if (err.message === "MISSING_COLS") showError("MISSING_COLS", err);
        else showError(err.message, err.message);
      });
  };
  fr.readAsArrayBuffer(file);
}

var fileInput = document.getElementById("fileInput");
fileInput.addEventListener("click", function(){ this.value = ""; });
fileInput.addEventListener("change", function(e){ if (e.target.files[0]) handleFile(e.target.files[0]); });
document.getElementById("clearAll").addEventListener("click", function(){
  state.filters = {}; state.period = null; render();
});
document.getElementById("tlClear").addEventListener("click", function(){
  state.period = null; render();
});

["dragenter","dragover"].forEach(function(ev){
  dz.addEventListener(ev, function(e){ e.preventDefault(); dz.classList.add("over"); });
});
["dragleave","drop"].forEach(function(ev){
  dz.addEventListener(ev, function(e){ e.preventDefault(); dz.classList.remove("over"); });
});
window.addEventListener("dragover", function(e){ e.preventDefault(); });
window.addEventListener("drop", function(e){
  e.preventDefault();
  var f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) handleFile(f);                                  // dropping anywhere replaces the current file
});

var raf = null;
document.addEventListener("scroll", function(e){
  if (e.target && e.target.id === "tblScroll" && !raf){
    raf = requestAnimationFrame(function(){ raf = null; paintRows(false); });
  }
}, true);
document.addEventListener("click", function(e){
  closeOpenPopup(e.target);
});
window.addEventListener("resize", function(){ if (!dash.hidden) paintRows(false); });

/* ---------- mobile filter bar (sticky, collapsible) ---------- */
var filtersSection = document.getElementById("filtersSection");
var mfToggle = document.getElementById("mfToggle");
mfToggle.addEventListener("click", function(){
  var open = !filtersSection.classList.contains("mExpanded");
  filtersSection.classList.toggle("mExpanded", open);
  mfToggle.setAttribute("aria-expanded", open ? "true" : "false");
});
document.addEventListener("click", function(e){
  if (filtersSection.classList.contains("mExpanded") && !e.target.closest("#filtersSection")) {
    filtersSection.classList.remove("mExpanded");
    mfToggle.setAttribute("aria-expanded", "false");
  }
});

/* ---------- mobile status/KPI band (collapsed by default) ---------- */
var kpiband = document.getElementById("kpiband");
var kpiToggle = document.getElementById("kpiToggle");
kpiToggle.addEventListener("click", function(){
  var open = !kpiband.classList.contains("mExpanded");
  kpiband.classList.toggle("mExpanded", open);
  kpiToggle.setAttribute("aria-expanded", open ? "true" : "false");
});

function syncHeaderHeight(){
  document.documentElement.style.setProperty("--headerH", topbar.offsetHeight + "px");
}
new ResizeObserver(syncHeaderHeight).observe(topbar);
window.addEventListener("resize", syncHeaderHeight);
syncHeaderHeight();
