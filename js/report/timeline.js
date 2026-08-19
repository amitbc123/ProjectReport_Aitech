/* Project Report — 10. Timeline */
import { TODAY } from './columns.js?v=20260819';
import { esc, money, moneyShort, nfInt } from './format.js?v=20260819';
import { state } from './state.js?v=20260819';
import { render } from './render.js?v=20260819';

function bucketize(rows){
  var months = new Set();
  rows.forEach(function(r){
    if (r._date !== null) { var d = new Date(r._date); months.add(d.getUTCFullYear()+"-"+d.getUTCMonth()); }
  });
  var mode = months.size <= 24 ? "month" : (months.size <= 160 ? "quarter" : "year");
  var map = new Map();
  rows.forEach(function(r){
    if (r._date === null) return;
    var d = new Date(r._date), y = d.getUTCFullYear(), m = d.getUTCMonth(), key, start, end, label;
    if (mode === "month"){
      key = y+"-"+String(m+1).padStart(2,"0");
      start = Date.UTC(y,m,1); end = Date.UTC(y,m+1,0);
      label = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m];
    } else if (mode === "quarter"){
      var q = Math.floor(m/3);
      key = y+"-Q"+(q+1);
      start = Date.UTC(y,q*3,1); end = Date.UTC(y,q*3+3,0);
      label = "Q"+(q+1);
    } else {
      key = String(y); start = Date.UTC(y,0,1); end = Date.UTC(y,11,31); label = "";
    }
    var b = map.get(key);
    if (!b) { b = { key:key, label:label, year:y, v:0, n:0, start:start, end:end }; map.set(key,b); }
    b.v += r._ext; b.n++;
  });
  return { mode:mode, bins:Array.from(map.values()).sort(function(a,b){ return a.start - b.start; }) };
}
function niceTicks(min, max){
  if (min === max) max = min + 1;
  var span = max - min, step = Math.max(1, Math.pow(10, Math.floor(Math.log10(span/3))));
  [1,2,2.5,5,10].some(function(m){ if (span/(step*m) <= 4) { step *= m; return true; } return false; });
  var lo = Math.floor(min/step)*step, hi = Math.ceil(max/step)*step, t = [];
  for (var v = lo; v <= hi + step*1e-9; v += step) t.push(Math.abs(v) < step*1e-9 ? 0 : v);
  return t;
}
export function renderTimeline(){
  var host = document.getElementById("timeline");
  var tlClear = document.getElementById("tlClear");
  tlClear.hidden = !state.period;
  if (state.period) tlClear.innerHTML = 'Showing <b>'+esc(state.period.label)+'</b> — clear';
  var res = bucketize(state.filtered), bins = res.bins;
  document.getElementById("tlHint").innerHTML = bins.length
    ? 'Sum of <span class="mono">EXT DOLLAR PRICE</span> per ' + res.mode + '. Click a bar to filter to that period.'
    : 'Sum of value per shipping period.';
  if (!bins.length){
    host.innerHTML = '<div class="empty"><b>No dated lines</b>Rows without a shipping date stay in the table but cannot be placed on a timeline.</div>';
    return;
  }
  var band = Math.max(38, Math.min(76, Math.floor(1200 / bins.length)));
  var padL = 62, padR = 16, padT = 14, padB = 44, H = 236;
  var W = padL + padR + band * bins.length;
  var vals = bins.map(function(b){ return b.v; });
  var lo = Math.min(0, Math.min.apply(null, vals));
  var hi = Math.max(0, Math.max.apply(null, vals));
  if (hi === lo) hi = lo + 1;
  var ticks = niceTicks(lo, hi);
  lo = ticks[0]; hi = ticks[ticks.length-1];
  var plotH = H - padT - padB;
  var y = function(v){ return padT + (hi - v) / (hi - lo) * plotH; };
  var zero = y(0), lastYear = null;

  var s = ['<svg width="'+W+'" height="'+H+'" role="img" aria-label="Value by shipping period">'];
  ticks.forEach(function(t){
    var yy = y(t);
    s.push('<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+yy+'" y2="'+yy+'" stroke="'+(t===0?"#CFD5DD":"#EEF0F3")+'"/>');
    s.push('<text x="'+(padL-10)+'" y="'+(yy+4)+'" text-anchor="end" font-size="10.5" fill="#98A1AC">'+moneyShort(t)+'</text>');
  });
  bins.forEach(function(b,i){
    var x = padL + i*band;
    var col = b.v < 0 ? "var(--rose)" : (b.end >= TODAY ? "var(--gold)" : "var(--slate)");
    var top = b.v >= 0 ? y(b.v) : zero;
    var h = Math.max(1.5, Math.abs(y(b.v) - zero));
    var bw = Math.min(30, band - 12);
    s.push('<g class="tl-band" tabindex="0" role="button" data-i="'+i+'" aria-label="'+esc(b.key)+', '+money(b.v)+', '+b.n+' lines">');
    s.push('<title>'+esc(b.key)+' · '+money(b.v)+' · '+nfInt.format(b.n)+' lines</title>');
    s.push('<rect class="tl-hit" x="'+x+'" y="'+padT+'" width="'+band+'" height="'+plotH+'" fill="transparent"/>');
    s.push('<rect x="'+(x + (band-bw)/2)+'" y="'+top+'" width="'+bw+'" height="'+h+'" rx="1.5" fill="'+col+'"/>');
    s.push('</g>');
    if (res.mode !== "year") s.push('<text x="'+(x+band/2)+'" y="'+(H-24)+'" text-anchor="middle" font-size="10" fill="#6A7381">'+b.label+'</text>');
    if (b.year !== lastYear){
      s.push('<text x="'+(x+band/2)+'" y="'+(H-9)+'" text-anchor="middle" font-size="10.5" fill="#12161C" font-weight="600">'+b.year+'</text>');
      lastYear = b.year;
    }
  });
  var idx = bins.findIndex(function(b){ return b.end >= TODAY; });
  if (idx > 0){
    var mx = padL + idx*band;
    s.push('<line x1="'+mx+'" x2="'+mx+'" y1="'+(padT-6)+'" y2="'+(padT+plotH)+'" stroke="#A97D18" stroke-dasharray="2 3"/>');
    s.push('<text x="'+(mx+5)+'" y="'+(padT-1)+'" font-size="9.5" fill="#A97D18" letter-spacing="1">TODAY</text>');
  }
  s.push('<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+zero+'" y2="'+zero+'" stroke="#CFD5DD"/>');
  s.push("</svg>");
  host.innerHTML = s.join("");

  host.querySelectorAll(".tl-band").forEach(function(g){
    function apply(){
      var b = bins[+g.dataset.i];
      state.period = { from:b.start, to:b.end, label:b.key };
      render();
    }
    g.addEventListener("click", apply);
    g.addEventListener("keydown", function(e){ if (e.key==="Enter"||e.key===" "){ e.preventDefault(); apply(); } });
  });
  if (idx > 0) host.scrollLeft = Math.max(0, padL + idx*band - host.clientWidth * 0.55);
}
