/* Project Report — 12. Status split — lines, quantity, value */
import { NOT_DONE } from './columns.js?v=20260819b';
import { esc, money, nfInt } from './format.js?v=20260819b';
import { state, facetOf } from './state.js?v=20260819b';
import { setOnly } from './filter-bar.js?v=20260819b';

export function renderStatus(){
  var host = document.getElementById("statusChart"), rows = state.filtered;
  if (!rows.length){
    host.innerHTML = '<div class="empty"><b>No lines</b>Adjust the filters to see the Done split.</div>';
    return;
  }
  var cats = new Map();
  rows.forEach(function(r){
    var c = facetOf(r, "Done");
    var e = cats.get(c) || { n:0, q:0, v:0 };
    e.n++; e.q += r._qty; e.v += r._ext;
    cats.set(c, e);
  });
  var order = ["Done", NOT_DONE].filter(function(k){ return cats.has(k); })
    .concat(Array.from(cats.keys()).filter(function(k){ return k !== "Done" && k !== NOT_DONE; }));
  var colorOf = function(k){ return k === "Done" ? "var(--teal)" : k === NOT_DONE ? "var(--slate)" : "var(--rose)"; };

  var totN = rows.length;
  var totQ = order.reduce(function(s,k){ return s + Math.max(0, cats.get(k).q); }, 0) || 1;
  var totV = order.reduce(function(s,k){ return s + Math.max(0, cats.get(k).v); }, 0) || 1;

  function block(title, note, pick, tot, fmt){
    var segs = order.map(function(k){
      var w = Math.max(0, pick(cats.get(k))) / tot * 100;
      if (w < 0.4) w = 0;
      return '<div style="width:'+w+'%;background:'+colorOf(k)+'" role="button" tabindex="0" data-v="'+esc(k)+'" '+
             'title="'+esc(k)+' — '+fmt(pick(cats.get(k)))+'"></div>';
    }).join("");
    var leg = order.map(function(k){
      return '<span><i style="background:'+colorOf(k)+'"></i>'+esc(k)+' <em>'+fmt(pick(cats.get(k)))+'</em></span>';
    }).join("");
    return '<div class="sblock"><div class="cap"><span>'+title+'</span><span>'+note+'</span></div>'+
           '<div class="stack">'+segs+'</div><div class="slegend">'+leg+'</div></div>';
  }
  var qtyAll = order.reduce(function(s,k){ return s + cats.get(k).q; }, 0);

  host.innerHTML =
    block("By lines",    nfInt.format(totN) + " lines",  function(e){ return e.n; }, totN, function(v){ return nfInt.format(v); }) +
    block("By quantity", nfInt.format(qtyAll) + " units", function(e){ return e.q; }, totQ, function(v){ return nfInt.format(v); }) +
    block("By value",    "negative credits shown at zero width", function(e){ return e.v; }, totV, money);

  host.querySelectorAll("[data-v]").forEach(function(el){
    function go(){ setOnly("Done", el.dataset.v); }
    el.addEventListener("click", go);
    el.addEventListener("keydown", function(e){ if (e.key==="Enter"||e.key===" "){ e.preventDefault(); go(); } });
  });
}
