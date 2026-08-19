/* Export Plan — 13. Remarks edits: write them back into the source file
   and offer a download of the changed copy.
   ------------------------------------------------------------
   state.remarksEdits (recKey -> new text, see pie.js flattenItems for
   recKey) is the single source of truth for "what's been edited" — typing
   in a Remarks cell only ever touches that Map (see wireRemarksEditing in
   pie.js), never state.originalBytes/state.wb directly. Neither of those
   is touched until the moment a download is actually requested, so a
   re-render mid-edit (a filter change, a sort) can never leave anything
   half-mutated.

   Two ways to produce the downloaded file, tried in order:
   1. xlsx-patch.js edits the source .xlsx's own ZIP/XML bytes directly —
      the only way to keep every other cell's formatting (fills, fonts,
      colors) exactly as the source had it. This is the path every real
      .xlsx takes.
   2. A legacy .xls (not a ZIP at all, so xlsx-patch.js can't touch it)
      falls back to rebuilding through XLSX.write(state.wb) — correct data,
      but this vendored SheetJS build's writer only ever emits a generic
      styles.xml, so that file's cell formatting is not preserved. A toast
      says so explicitly when this path is the one that ran. */
import { state } from './state.js?v=20260819';
import { esc } from './format.js?v=20260819';
import { patchRemarksIntoXlsx } from './xlsx-patch.js?v=20260819';

export function hasRemarksEdits(){
  return state.remarksEdits.size > 0;
}
// The one place the Download button actually shows/hides — called after
// every list re-render (pie.js) and after every edit (pie.js
// wireRemarksEditing), so it never drifts from state.remarksEdits.
export function updateRemarksActionRow(){
  var row = document.getElementById("epRemarksActionRow");
  if (row) row.hidden = !hasRemarksEdits();
}
// Fallback path only (legacy .xls) — see the file banner. Loses cell
// formatting on write; never used for a real .xlsx source.
function applyRemarksEditsToWorkbook(wb){
  if (state.remarksCol == null) return;
  state.remarksEdits.forEach(function(text, recKey){
    var sep = recKey.lastIndexOf("|");
    var sheet = recKey.slice(0, sep), row = +recKey.slice(sep + 1);
    var ws = wb.Sheets[sheet];
    if (!ws) return;
    var addr = XLSX.utils.encode_cell({ r:row, c:state.remarksCol });
    if (text === "") delete ws[addr];
    else ws[addr] = { t:"s", v:text };
  });
  return XLSX.write(wb, { bookType:"xlsx", type:"array", cellStyles:true });
}
function outputName(sourceName){
  var name = sourceName || "export-plan.xlsx";
  var dot = name.lastIndexOf(".");
  var base = dot === -1 ? name : name.slice(0, dot);
  return (dot !== -1 ? base : name) + "_updated.xlsx";
}
function toast(msg){
  var old = document.getElementById("toast");
  if (old) old.remove();
  var t = document.createElement("div");
  t.id = "toast";
  t.innerHTML = '<div class="tmsg" style="margin:0">'+msg+'</div><button class="btn ghost" aria-label="Dismiss">Dismiss</button>';
  document.body.appendChild(t);
  t.querySelector("button").addEventListener("click", function(){ t.remove(); });
}
function triggerDownload(bytes, name){
  var blob = new Blob([bytes], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}
export function downloadUpdatedFile(){
  if (!hasRemarksEdits()) return;
  var name = outputName(state.fileName);
  var patch = state.originalBytes
    ? patchRemarksIntoXlsx(state.originalBytes, state.sheetName, state.remarksCol, state.remarksEdits)
    : Promise.reject(new Error("NO_ORIGINAL_BYTES"));
  patch.then(function(bytes){
    triggerDownload(bytes, name);
    toast("Downloaded <b>"+esc(name)+"</b> — an exact copy of the source file with your Remarks changes.");
  }).catch(function(err){
    // NOT_ZIP is the only *expected* rejection — a legacy .xls source,
    // which isn't a ZIP archive at all. Anything else is a real bug, but
    // the fallback still produces a correct (if unstyled) file rather
    // than leaving the user with nothing.
    if (!state.wb){ toast("Could not build the file. Try reloading and re-editing."); return; }
    try {
      var bytes = applyRemarksEditsToWorkbook(state.wb);
      triggerDownload(bytes, name);
      toast("Downloaded <b>"+esc(name)+"</b> with your Remarks changes. This source file's own cell formatting (colors, fonts) could not be carried over"+(err && err.message === "NOT_ZIP" ? " for a legacy .xls file" : "")+" — only the data.");
    } catch (e2){
      toast("Could not build the file. Try reloading and re-editing.");
    }
  });
}
var epDownloadRemarksBtn = document.getElementById("epDownloadRemarksBtn");
if (epDownloadRemarksBtn) epDownloadRemarksBtn.addEventListener("click", downloadUpdatedFile);
