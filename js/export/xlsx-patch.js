/* Export Plan — 14. Byte-level Remarks patch: edit the source .xlsx's own
   ZIP/XML, never rewrite it through SheetJS.
   ------------------------------------------------------------
   remarks-export.js originally rebuilt the downloaded file with
   XLSX.write(state.wb, {cellStyles:true, ...}). That loses every cell's
   formatting — fills, fonts, colors — because this vendored SheetJS build
   (js-xlsx 1.15.0, the free/community edition) only ever emits a generic,
   blank styles.xml on write; cellStyles:true controls what gets *parsed*
   on read, not what a write actually re-serializes, and this build's
   writer has no real style-serialization path at all. Confirmed: every
   downloaded file came back with every color stripped, on an otherwise
   correctly-edited Remarks cell.

   The only way to hand back a file that's genuinely "the source,
   untouched, plus the edited Remarks cells" is to never run it through
   XLSX.write. An .xlsx is a ZIP archive of XML parts; this module unzips
   the *original* file's own bytes, edits only the <c> elements of the one
   worksheet XML part that actually changed (setting each to an inline
   string — never touching sharedStrings.xml, so no other cell that
   happens to reference the same shared string is affected), and re-zips
   every part — styles.xml, theme, the other sheets — exactly as it was.
   Decompress-then-recompress is lossless, so an untouched part's content
   round-trips byte-for-byte identical even though its *compressed* bytes
   differ.

   Chromium-only (like the rest of this app — see EXPORT_PLAN_NOTES.md):
   uses the native CompressionStream/DecompressionStream('deflate-raw')
   codec instead of vendoring a JS deflate implementation. A legacy .xls
   (OLE/CFBF, not a ZIP at all) can't go through this path at all — see
   NOT_ZIP below; the caller falls back to the old XLSX.write path for
   that case. */

var XML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
var REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
var XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

// ---- CRC32 (standard IEEE 802.3 table-driven implementation) ----
var CRC_TABLE = (function(){
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++){
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes){
  var c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function inflateRaw(bytes){
  var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).arrayBuffer().then(function(buf){ return new Uint8Array(buf); });
}
function deflateRaw(bytes){
  var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Response(stream).arrayBuffer().then(function(buf){ return new Uint8Array(buf); });
}

// ---- Minimal ZIP reader/writer — store (0) and deflate (8) only, no
// zip64/spanning/encryption, which is every .xlsx in practice at the
// sizes this app deals with. ----
function unzip(u8){
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  var eocdSig = 0x06054b50, i = -1;
  var scanFrom = Math.max(0, u8.length - 22 - 65536);
  for (var p = u8.length - 22; p >= scanFrom; p--){
    if (dv.getUint32(p, true) === eocdSig){ i = p; break; }
  }
  if (i < 0) throw new Error("ZIP_EOCD_NOT_FOUND");
  var cdCount = dv.getUint16(i + 10, true);
  var cdOffset = dv.getUint32(i + 16, true);

  var jobs = [], off = cdOffset;
  for (var n = 0; n < cdCount; n++){
    if (dv.getUint32(off, true) !== 0x02014b50) throw new Error("ZIP_CD_BAD_SIG");
    var method = dv.getUint16(off + 10, true);
    var compSize = dv.getUint32(off + 20, true);
    var nameLen = dv.getUint16(off + 28, true);
    var extraLen = dv.getUint16(off + 30, true);
    var commentLen = dv.getUint16(off + 32, true);
    var lhOffset = dv.getUint32(off + 42, true);
    var name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));

    var lhNameLen = dv.getUint16(lhOffset + 26, true);
    var lhExtraLen = dv.getUint16(lhOffset + 28, true);
    var dataStart = lhOffset + 30 + lhNameLen + lhExtraLen;
    var raw = u8.subarray(dataStart, dataStart + compSize);
    jobs.push({ name:name, method:method, raw:raw });

    off += 46 + nameLen + extraLen + commentLen;
  }
  return Promise.all(jobs.map(function(j){
    return j.method === 0 ? Promise.resolve(new Uint8Array(j.raw)) : inflateRaw(j.raw);
  })).then(function(datas){
    var entries = new Map();
    jobs.forEach(function(j, idx){ entries.set(j.name, datas[idx]); });
    return entries;
  });
}
// Always writes method 8 (deflate) for every part. Lossless either way —
// what matters is each part's *decompressed* bytes, which for every
// untouched entry are identical to what unzip() handed back for it.
function zip(entries){
  var names = Array.from(entries.keys());
  var enc = new TextEncoder();
  return Promise.all(names.map(function(name){ return deflateRaw(entries.get(name)); }))
    .then(function(compressedList){
      var localParts = [], centralParts = [], offset = 0;
      names.forEach(function(name, idx){
        var data = entries.get(name), compressed = compressedList[idx];
        var nameBytes = enc.encode(name), crc = crc32(data);

        var lh = new Uint8Array(30 + nameBytes.length), lv = new DataView(lh.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0, true);
        lv.setUint16(8, 8, true);
        lv.setUint16(10, 0, true);
        lv.setUint16(12, 0, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, compressed.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        lh.set(nameBytes, 30);
        localParts.push(lh, compressed);

        var cd = new Uint8Array(46 + nameBytes.length), cv = new DataView(cd.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0, true);
        cv.setUint16(10, 8, true);
        cv.setUint16(12, 0, true);
        cv.setUint16(14, 0, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, compressed.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true);
        cv.setUint16(32, 0, true);
        cv.setUint16(34, 0, true);
        cv.setUint16(36, 0, true);
        cv.setUint32(38, 0, true);
        cv.setUint32(42, offset, true);
        cd.set(nameBytes, 46);
        centralParts.push(cd);

        offset += lh.length + compressed.length;
      });
      var centralStart = offset;
      var centralSize = centralParts.reduce(function(s, part){ return s + part.length; }, 0);
      var eocd = new Uint8Array(22), ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(8, names.length, true);
      ev.setUint16(10, names.length, true);
      ev.setUint32(12, centralSize, true);
      ev.setUint32(16, centralStart, true);

      var out = new Uint8Array(offset + centralSize + 22), pos = 0;
      localParts.forEach(function(part){ out.set(part, pos); pos += part.length; });
      centralParts.forEach(function(part){ out.set(part, pos); pos += part.length; });
      out.set(eocd, pos);
      return out;
    });
}

// ---- OOXML cell address helpers ----
function colIndexToLetters(n){
  var s = "", num = n + 1;
  while (num > 0){
    var rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}
function cellRef(row0, col0){ return colIndexToLetters(col0) + (row0 + 1); }
function colLettersToIndex(letters){
  var n = 0;
  for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}
function refCol(ref){ return colLettersToIndex(/^[A-Z]+/.exec(ref)[0]); }

// ---- <row>/<c> find-or-create, kept in the ascending order OOXML expects ----
function findOrCreateRow(sheetDataEl, doc, row0){
  var rNum = row0 + 1;
  var rows = sheetDataEl.getElementsByTagName("row");
  var insertBefore = null;
  for (var i = 0; i < rows.length; i++){
    var rAttr = parseInt(rows[i].getAttribute("r"), 10);
    if (rAttr === rNum) return rows[i];
    if (rAttr > rNum){ insertBefore = rows[i]; break; }
  }
  var row = doc.createElementNS(XML_NS, "row");
  row.setAttribute("r", String(rNum));
  sheetDataEl.insertBefore(row, insertBefore);
  return row;
}
function findOrCreateCell(rowEl, doc, row0, col0){
  var ref = cellRef(row0, col0);
  var cells = rowEl.getElementsByTagName("c");
  var insertBefore = null;
  for (var i = 0; i < cells.length; i++){
    var cRef = cells[i].getAttribute("r");
    if (cRef === ref) return cells[i];
    if (cRef && refCol(cRef) > col0){ insertBefore = cells[i]; break; }
  }
  var c = doc.createElementNS(XML_NS, "c");
  c.setAttribute("r", ref);
  rowEl.insertBefore(c, insertBefore);
  return c;
}
// Overwrites whatever the cell held (a shared-string ref, a number, a
// formula, nothing at all) with an inline string — the one cell type that
// can never disturb any *other* cell (a shared-string edit could, if that
// index were reused elsewhere). The cell's existing style index (`s`
// attribute, its only link to styles.xml) is left exactly as it was.
function setInlineString(doc, cellEl, text){
  cellEl.setAttribute("t", "inlineStr");
  Array.prototype.slice.call(cellEl.childNodes).forEach(function(node){
    if (node.nodeType === 1 && (node.localName === "v" || node.localName === "f" || node.localName === "is")){
      cellEl.removeChild(node);
    }
  });
  var is = doc.createElementNS(XML_NS, "is");
  var t = doc.createElementNS(XML_NS, "t");
  t.setAttributeNS(XML_NAMESPACE, "xml:space", "preserve");
  t.textContent = text;
  is.appendChild(t);
  cellEl.appendChild(is);
}

// entries: Map<partName, Uint8Array> from unzip(). Mutated in place with
// the one edited worksheet part; every other part is left untouched.
function locateSheetPart(entries, sheetName){
  var dec = new TextDecoder("utf-8");
  var parser = new DOMParser();

  var wbBytes = entries.get("xl/workbook.xml");
  if (!wbBytes) throw new Error("WORKBOOK_XML_NOT_FOUND");
  var wbDoc = parser.parseFromString(dec.decode(wbBytes), "application/xml");
  var sheetEls = wbDoc.getElementsByTagName("sheet");
  var rId = null;
  for (var i = 0; i < sheetEls.length; i++){
    if (sheetEls[i].getAttribute("name") === sheetName){
      rId = sheetEls[i].getAttributeNS(REL_NS, "id") || sheetEls[i].getAttribute("r:id");
      break;
    }
  }
  if (!rId) throw new Error("SHEET_NOT_FOUND_IN_WORKBOOK");

  var relsBytes = entries.get("xl/_rels/workbook.xml.rels");
  if (!relsBytes) throw new Error("WORKBOOK_RELS_NOT_FOUND");
  var relsDoc = parser.parseFromString(dec.decode(relsBytes), "application/xml");
  var relEls = relsDoc.getElementsByTagName("Relationship");
  var target = null;
  for (var j = 0; j < relEls.length; j++){
    if (relEls[j].getAttribute("Id") === rId){ target = relEls[j].getAttribute("Target"); break; }
  }
  if (!target) throw new Error("SHEET_RELATIONSHIP_NOT_FOUND");

  var sheetPath = "xl/" + target.replace(/^\/?xl\//, "").replace(/^\.?\//, "");
  if (!entries.has(sheetPath)) throw new Error("SHEET_PART_NOT_FOUND");
  return sheetPath;
}

// edits: Map<recKey, text> where recKey is "sheetName|row0" (see
// pie.js flattenItems). Only entries whose sheet matches sheetName are
// applied — everything else in the workbook is returned byte-for-byte
// unchanged (down to being run through the same lossless
// decompress/recompress every part goes through).
export function patchRemarksIntoXlsx(originalBytes, sheetName, remarksCol, edits){
  if (originalBytes[0] !== 0x50 || originalBytes[1] !== 0x4B) return Promise.reject(new Error("NOT_ZIP"));
  if (remarksCol == null) return Promise.reject(new Error("NO_REMARKS_COLUMN"));
  return unzip(originalBytes).then(function(entries){
    var sheetPath = locateSheetPart(entries, sheetName);
    var dec = new TextDecoder("utf-8"), parser = new DOMParser();
    var sheetText = dec.decode(entries.get(sheetPath));
    var prologMatch = /^<\?xml[^>]*\?>\s*/.exec(sheetText);
    var prolog = prologMatch ? prologMatch[0] : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
    var sheetDoc = parser.parseFromString(sheetText, "application/xml");
    var sheetDataEl = sheetDoc.getElementsByTagName("sheetData")[0];
    if (!sheetDataEl) throw new Error("SHEETDATA_NOT_FOUND");

    edits.forEach(function(text, recKey){
      var sep = recKey.lastIndexOf("|");
      var editSheet = recKey.slice(0, sep), row0 = +recKey.slice(sep + 1);
      if (editSheet !== sheetName) return;
      var rowEl = findOrCreateRow(sheetDataEl, sheetDoc, row0);
      var cellEl = findOrCreateCell(rowEl, sheetDoc, row0, remarksCol);
      setInlineString(sheetDoc, cellEl, text);
    });

    var newSheetXml = prolog + new XMLSerializer().serializeToString(sheetDoc.documentElement);
    entries.set(sheetPath, new TextEncoder().encode(newSheetXml));
    return zip(entries);
  });
}
