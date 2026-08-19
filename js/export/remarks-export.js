/* Export Plan — 13. Remarks edits: write them back into the loaded
   workbook and offer a download of the changed file.
   ------------------------------------------------------------
   state.remarksEdits (recKey -> new text, see pie.js flattenItems for
   recKey) is the single source of truth for "what's been edited" — typing
   in a Remarks cell only ever touches that Map (see wireRemarksEditing in
   pie.js), never state.wb directly. state.wb itself — every sheet, every
   cell this app never asked SheetJS to parse a meaning out of — is left
   completely alone until the moment a download is actually requested, so
   a re-render mid-edit (a filter change, a sort) can never leave the
   workbook half-mutated. */
import { state } from './state.js?v=20260819';
import { esc } from './format.js?v=20260819';

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
function recKeyParts(recKey){
  var sep = recKey.lastIndexOf("|");
  return { sheet: recKey.slice(0, sep), row: +recKey.slice(sep + 1) };
}
function applyRemarksEdits(wb){
  if (state.remarksCol == null) return;
  state.remarksEdits.forEach(function(text, recKey){
    var p = recKeyParts(recKey);
    var ws = wb.Sheets[p.sheet];
    if (!ws) return;
    var addr = XLSX.utils.encode_cell({ r:p.row, c:state.remarksCol });
    if (text === "") delete ws[addr];
    else ws[addr] = { t:"s", v:text };
  });
}
function outputName(sourceName){
  var name = sourceName || "export-plan.xlsx";
  var dot = name.lastIndexOf(".");
  var base = dot === -1 ? name : name.slice(0, dot);
  return base + "_updated.xlsx";
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
export function downloadUpdatedFile(){
  if (!state.wb || !hasRemarksEdits()) return;
  applyRemarksEdits(state.wb);
  var u8 = XLSX.write(state.wb, { bookType:"xlsx", type:"array", cellStyles:true });
  var name = outputName(state.fileName);
  var blob = new Blob([u8], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  toast("Downloaded <b>"+esc(name)+"</b> — an exact copy of the source file with your Remarks changes.");
}
var epDownloadRemarksBtn = document.getElementById("epDownloadRemarksBtn");
if (epDownloadRemarksBtn) epDownloadRemarksBtn.addEventListener("click", downloadUpdatedFile);
