/* Page router — Project Report / Export Plan
   ------------------------------------------------------------
   Purely additive: neither page's own script is touched. This
   just toggles which page's root element is visible and remembers
   the choice so a reload reopens the same page.

   The switcher itself lives inside each page's own header (next
   to that page's brand title, one line under it) rather than as a
   separate bar above everything — a standalone bar sat inset
   within .app's own side padding instead of bleeding to the edge
   like the header does, which visually read as the whole site
   having gotten narrower. */
var pages = { report: document.getElementById("page-report"), export: document.getElementById("page-export") };

function show(page){
  pages.report.hidden = page !== "report";
  pages.export.hidden = page !== "export";
}
function go(page){ show(page); }

["reportBrandTitle", "switchToExportBtn", "switchToExportBtn2"].forEach(function(id){
  document.getElementById(id).addEventListener("click", function(){ go("export"); });
});
["exportBrandTitle", "switchToReportBtn", "switchToReportBtn2"].forEach(function(id){
  document.getElementById(id).addEventListener("click", function(){ go("report"); });
});

// Project Report is always the page shown on a fresh load — no longer
// remembered across reloads via localStorage (that "last used page"
// behavior was a nice-to-have, not a request, and it meant a session
// spent on Export Plan would silently reopen there next time instead of
// on the intended default).
show("report");
