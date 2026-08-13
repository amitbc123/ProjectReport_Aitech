/* Project Report — 5. Compatibility path — real Excel workbooks (.xlsx / .xls)
   Same sheet names, same headers. Dates arrive as Excel serials, which
   toDate() (in format.js, via finishRow) already understands.
   Uses the vendored SheetJS global (window.XLSX) loaded by
   vendor/xlsx.full.min.js before this module runs. */
import { COLS, SHEET_ORDER } from './columns.js?v=20260813';
import { clean, finishRow } from './format.js?v=20260813';

export function parseExcelBinary(u8){
  if (typeof XLSX === "undefined") throw new Error("NO_XLSX");
  var wb = XLSX.read(u8, { type:"array", cellDates:false, cellStyles:false, sheetStubs:true });
  var sheets = [];
  var names = wb.SheetNames.filter(function(n){ return SHEET_ORDER.indexOf(n) !== -1; });
  if (!names.length) names = wb.SheetNames;
  names.forEach(function(name){
    var aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header:1, raw:true, defval:"", blankrows:false });
    if (!aoa.length) return;
    var head = {}, i;
    for (i = 0; i < aoa[0].length; i++) head[clean(aoa[0][i])] = i;
    var wanted = {}, miss = [];
    COLS.forEach(function(c){
      if (head[c.key] === undefined) miss.push(c.key);
      else wanted[c.key] = head[c.key];
    });
    if (miss.length) { var e = new Error("MISSING_COLS"); e.sheet = name; e.cols = miss; throw e; }
    var rows = [];
    for (i = 1; i < aoa.length; i++) {
      var arr = aoa[i], r = {}, any = false;
      for (var k in wanted) {
        var v = arr[wanted[k]];
        r[k] = (v === undefined || v === null) ? "" : clean(v);
        if (r[k] !== "") any = true;
      }
      if (any) rows.push(finishRow(r));
    }
    sheets.push({ name:name, rows:rows });
  });
  if (!sheets.length) throw new Error("NO_SHEETS");
  return sheets;
}
