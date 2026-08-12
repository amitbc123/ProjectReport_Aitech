/* Project Report — 2. Formatting, and 3. Value coercion (shared by both
   parsing paths: the SpreadsheetML fast path and the SheetJS compatibility
   path). */

export var nfInt = new Intl.NumberFormat("en-US", { maximumFractionDigits:0 });
export function money(v){
  var s = "$" + nfInt.format(Math.abs(Math.round(v)));
  return v < 0 ? "-" + s : s;
}
export function moneyShort(v){
  var a = Math.abs(v), s;
  if (a >= 1e9) s = (a/1e9).toFixed(a>=1e10?0:1) + "B";
  else if (a >= 1e6) s = (a/1e6).toFixed(a>=1e7?0:1) + "M";
  else if (a >= 1e3) s = (a/1e3).toFixed(a>=1e4?0:1) + "K";
  else s = String(Math.round(a));
  return (v < 0 ? "-$" : "$") + s;
}
export function moneyDec(v){
  var a = Math.abs(v);
  if (a >= 1000) return money(v);
  return (v < 0 ? "-$" : "$") + a.toFixed(2);
}
export function fmtDate(ms){
  if (ms == null) return "—";
  var d = new Date(ms), p = function(n){ return n < 10 ? "0"+n : String(n); };
  return p(d.getUTCDate()) + "/" + p(d.getUTCMonth()+1) + "/" + d.getUTCFullYear();
}
export function parseDMY(s){
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  return m ? Date.UTC(+m[3], +m[2]-1, +m[1]) : null;
}
export function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
export function pct(a,b){ return b ? Math.round(a/b*100) : 0; }

var NAMED_ENTITIES = { amp:"&", lt:"<", gt:">", quot:'"', apos:"'", nbsp:"\u00a0" };
function decodeEntities(s){
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, function(m, dec, hex, name){
    if (dec) return String.fromCodePoint(parseInt(dec,10));
    if (hex) return String.fromCodePoint(parseInt(hex,16));
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m;
  });
}
// A cell holding only U+00A0 looks empty but is not. Normalise it away.
export function clean(s){
  if (s === null || s === undefined) return "";
  s = decodeEntities(String(s)).replace(/[\u00a0\u200b\u200e\u200f]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}
export function toNumber(raw){
  if (raw === "" || raw == null) return null;
  var s = String(raw).replace(/[\s,$]/g, "");
  var negParen = /^\((.*)\)$/.exec(s);
  if (negParen) s = "-" + negParen[1];
  if (s === "" || !/^-?\d*\.?\d+(?:[eE][-+]?\d+)?$/.test(s)) return null;
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}
var EXCEL_EPOCH = Date.UTC(1899, 11, 30);
var SANE_MAX_YEAR = new Date().getUTCFullYear() + 8;
function suspectYear(y){ return y < 2000 || y > SANE_MAX_YEAR; }
// The three shapes the export can produce: ISO string, Excel serial number, blank.
export function toDate(raw){
  if (!raw) return null;
  var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) {
    var y = +iso[1];
    return { ms: Date.UTC(y, +iso[2]-1, +iso[3]), suspect: suspectYear(y) };
  }
  var n = toNumber(raw);
  if (n != null && n >= 20000 && n <= 60000) {       // Excel serial date, 1954-2064
    var ms = EXCEL_EPOCH + Math.round(n) * 86400000;
    return { ms: ms, suspect: suspectYear(new Date(ms).getUTCFullYear()) };
  }
  var p = Date.parse(raw);
  if (isNaN(p)) return null;
  return { ms:p, suspect: suspectYear(new Date(p).getUTCFullYear()) };
}

// Turns a { header -> raw string } object into the row shape the app uses.
export function finishRow(r){
  r._bad = 0;
  var q = toNumber(r["Quantity Open/Invoiced"]);
  var e = toNumber(r["EXT DOLLAR PRICE"]);
  if (q === null && r["Quantity Open/Invoiced"] !== "") r._bad |= 1;
  if (e === null && r["EXT DOLLAR PRICE"] !== "") r._bad |= 2;
  r._qty = q === null ? 0 : q;
  r._ext = e === null ? 0 : e;
  var d = toDate(r["Shipping Date"]);
  r._date = d ? d.ms : null;
  r._sus = !!(d && d.suspect);
  r._atr = r["General Remarks"].toUpperCase().indexOf("ATR") !== -1;
  return r;
}
