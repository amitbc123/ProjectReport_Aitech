/* Export Plan — 2. Formatting + value coercion
   ------------------------------------------------------------
   Deliberately duplicated from the Project Report module rather
   than shared: that module's helpers live inside its own closure,
   and reaching into it would mean editing working code. These are
   small, pure functions — the duplication is the safer trade. */

export var nfInt = new Intl.NumberFormat("en-US", { maximumFractionDigits:0 });
export function money(v){
  var s = "$" + nfInt.format(Math.abs(Math.round(v)));
  return v < 0 ? "-" + s : s;
}
export function fmtDate(ms){
  if (ms == null) return "—";
  var d = new Date(ms), p = function(n){ return n < 10 ? "0"+n : String(n); };
  return p(d.getUTCDate()) + "/" + p(d.getUTCMonth()+1) + "/" + d.getUTCFullYear();
}
export function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
var NAMED_ENTITIES = { amp:"&", lt:"<", gt:">", quot:'"', apos:"'", nbsp:"\u00a0" };
function decodeEntities(s){
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, function(m, dec, hex, name){
    if (dec) return String.fromCodePoint(parseInt(dec,10));
    if (hex) return String.fromCodePoint(parseInt(hex,16));
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m;
  });
}
export function clean(s){
  if (s === null || s === undefined) return "";
  s = decodeEntities(String(s)).replace(/[\u00a0\u200b\u200e\u200f]/g, " ");
  return s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
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
export function toDateMs(raw){
  if (raw === "" || raw == null) return null;
  var n = toNumber(raw);
  if (n != null && n >= 20000 && n <= 60000) return EXCEL_EPOCH + Math.round(n) * 86400000;  // Excel serial, 1954-2064
  var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  if (iso) return Date.UTC(+iso[1], +iso[2]-1, +iso[3]);
  var p = Date.parse(raw);
  return isNaN(p) ? null : p;
}
export function normHeader(s){
  return clean(s).replace(/\n/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
export function splitLines(s){
  if (!s) return [];
  return s.split("\n").map(clean).filter(function(x){ return x !== ""; });
}
