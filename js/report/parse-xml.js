/* Project Report — 4. Fast path — SpreadsheetML 2003 (.xml)
   ------------------------------------------------------------
   Verified against the real export: two worksheets, header on row 1,
   52 columns, every row carries all 52 cells, blanks are empty
   <Data> elements, and ss:Index appears only on <Column>.
   ss:Index on rows and cells is still honoured, because a future
   Excel export may legitimately omit empty cells.
   No DOMParser: 36 MB would build roughly 1.5M nodes. */
import { COLS, SHEET_ORDER } from './columns.js?v=20260813';
import { clean, finishRow } from './format.js?v=20260813';

function attr(tag, name){
  var i = tag.indexOf(name + "=\"");
  if (i === -1) return null;
  i += name.length + 2;
  var j = tag.indexOf("\"", i);
  return j === -1 ? null : tag.slice(i, j);
}
function findWorksheets(text){
  var out = [], p = 0;
  for(;;){
    var s = text.indexOf("<Worksheet", p);
    if (s === -1) break;
    var tagEnd = text.indexOf(">", s);
    var name = clean(attr(text.slice(s, tagEnd), "ss:Name") || "");
    var tStart = text.indexOf("<Table", tagEnd);
    var wsEnd = text.indexOf("</Worksheet>", tagEnd);
    if (tStart === -1 || (wsEnd !== -1 && tStart > wsEnd)) { p = tagEnd + 1; continue; }
    var tHead = text.indexOf(">", tStart);
    var tEnd = text.indexOf("</Table>", tHead);
    if (tEnd === -1) tEnd = wsEnd === -1 ? text.length : wsEnd;
    out.push({ name:name, from:tHead + 1, to:tEnd });
    p = tEnd;
  }
  return out;
}
function parseRow(row, wanted){
  var cells = {}, col = 0, p = 0;
  for(;;){
    var s = row.indexOf("<Cell", p);
    if (s === -1) break;
    var c = row.charCodeAt(s + 5);
    if (c !== 32 && c !== 62 && c !== 47) { p = s + 5; continue; }
    var tagEnd = row.indexOf(">", s);
    if (tagEnd === -1) break;
    var idx = attr(row.slice(s, tagEnd), "ss:Index");
    if (idx) col = parseInt(idx, 10) - 1;

    if (row.charCodeAt(tagEnd - 1) === 47) {
      p = tagEnd + 1;
    } else {
      var cellEnd = row.indexOf("</Cell>", tagEnd);
      if (cellEnd === -1) cellEnd = row.length;
      if (wanted[col] !== undefined) {
        var inner = row.slice(tagEnd + 1, cellEnd);
        var d = inner.indexOf("<Data");
        if (d !== -1) {
          var dEnd = inner.indexOf(">", d);
          if (inner.charCodeAt(dEnd - 1) !== 47) {
            var close = inner.indexOf("</Data>", dEnd);
            cells[col] = inner.slice(dEnd + 1, close === -1 ? inner.length : close);
          }
        }
      }
      p = cellEnd + 7;
    }
    col++;
  }
  return cells;
}
function parseHeaderRow(row){
  var all = {}, i;
  for (i = 0; i < 300; i++) all[i] = true;
  var cells = parseRow(row, all), map = {};
  for (var k in cells) map[clean(cells[k])] = +k;
  return map;
}
function nextRow(text, from, to){
  var s;
  for(;;){
    s = text.indexOf("<Row", from);
    if (s === -1 || s >= to) return null;
    var c = text.charCodeAt(s + 4);
    if (c === 32 || c === 62 || c === 47) break;
    from = s + 4;
  }
  var tagEnd = text.indexOf(">", s);
  if (text.charCodeAt(tagEnd - 1) === 47) return { body:"", end:tagEnd + 1 };
  var e = text.indexOf("</Row>", tagEnd);
  if (e === -1 || e > to) return null;
  return { body: text.slice(tagEnd + 1, e), end: e + 6 };
}
function buildRowXml(cells, wanted){
  var r = {};
  for (var idx in wanted) r[wanted[idx]] = cells[idx] === undefined ? "" : clean(cells[idx]);
  return finishRow(r);
}
export function parseSpreadsheetML(text, onProgress){
  return new Promise(function(resolve, reject){
    var ws = findWorksheets(text);
    var known = ws.filter(function(w){ return SHEET_ORDER.indexOf(w.name) !== -1; });
    if (known.length) ws = known;
    if (!ws.length) return reject(new Error("NO_SHEETS"));
    var sheets = [], si = 0, cursor = null, missing = null, total = text.length;

    function openSheet(){
      var w = ws[si];
      var first = nextRow(text, w.from, w.to);
      if (!first) { missing = { sheet:w.name, cols:COLS.map(function(c){ return c.key; }) }; return true; }
      var head = parseHeaderRow(first.body), wanted = {}, miss = [];
      COLS.forEach(function(c){
        if (head[c.key] === undefined) miss.push(c.key);
        else wanted[head[c.key]] = c.key;
      });
      if (miss.length) { missing = { sheet:w.name, cols:miss }; return true; }
      cursor = { w:w, pos:first.end, wanted:wanted, rows:[] };
      return false;
    }
    function closeSheet(){ sheets.push({ name:cursor.w.name, rows:cursor.rows }); cursor = null; si++; }

    function step(){
      if (missing) { var e = new Error("MISSING_COLS"); e.sheet = missing.sheet; e.cols = missing.cols; return reject(e); }
      var t0 = performance.now();
      while (performance.now() - t0 < 24) {
        if (!cursor) {
          if (si >= ws.length) { onProgress(1); return resolve(sheets); }
          if (openSheet()) return step();
        }
        var n = 0;
        while (n++ < 250) {
          var r = nextRow(text, cursor.pos, cursor.w.to);
          if (!r) { closeSheet(); break; }
          cursor.pos = r.end;
          if (r.body) cursor.rows.push(buildRowXml(parseRow(r.body, cursor.wanted), cursor.wanted));
          if (performance.now() - t0 > 24) break;
        }
        if (cursor) onProgress(Math.min(0.99, cursor.pos / total));
      }
      setTimeout(step, 0);
    }
    setTimeout(step, 0);
  });
}
