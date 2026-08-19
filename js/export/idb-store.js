/* Export Plan — 12. Remember the last file — IndexedDB, works on iPhone too.
   ------------------------------------------------------------
   Shares the "aitech-report" database and "files" object store
   that the Project Report page already creates, but under its
   own key, so the two pages never overwrite each other's file.
   No folder auto-load here: unlike the daily report, the export
   plan has no fixed network path, so this only restores the last
   file a person picked by hand. */
import { esc } from './format.js?v=20260819b';
import { epToast, epHandleFile } from './file-intake.js?v=20260819b';

var IDB_NAME = "aitech-report", IDB_FILES = "files", IDB_FILEKEY = "lastFileExportPlan";
function idbOpen(){
  return new Promise(function(res, rej){
    if (!window.indexedDB) return rej();
    var rq = indexedDB.open(IDB_NAME, 2);
    rq.onupgradeneeded = function(){
      var db = rq.result;
      if (!db.objectStoreNames.contains("handles")) db.createObjectStore("handles");
      if (!db.objectStoreNames.contains(IDB_FILES)) db.createObjectStore(IDB_FILES);
    };
    rq.onsuccess = function(){ res(rq.result); };
    rq.onerror = function(){ rej(); };
  });
}
export function epCacheFile(file){
  idbOpen().then(function(db){
    try{
      var tx = db.transaction(IDB_FILES, "readwrite");
      tx.objectStore(IDB_FILES).put({ name:file.name, ts:Date.now(), blob:file }, IDB_FILEKEY);
    }catch(e){}
  }).catch(function(){});
}
function epRestoreCached(rec){
  var f;
  try{ f = new File([rec.blob], rec.name || "export-plan.xlsx", { type:(rec.blob && rec.blob.type) || "" }); }
  catch(e){ f = rec.blob; try{ f.name = rec.name; }catch(_){} }
  epToast('Showing the last file you loaded' + (rec.name ? ' (<b>'+esc(rec.name)+'</b>)' : '') +
        (rec.ts ? ', saved '+new Date(rec.ts).toLocaleString() : '') +
        '. Tap <b>Choose file</b> to load a newer one.', "info");
  epHandleFile(f);
}
export function epBootstrap(){
  idbOpen().then(function(db){
    return new Promise(function(res){
      try{
        var rq = db.transaction(IDB_FILES, "readonly").objectStore(IDB_FILES).get(IDB_FILEKEY);
        rq.onsuccess = function(){ res(rq.result || null); };
        rq.onerror = function(){ res(null); };
      }catch(e){ res(null); }
    });
  }).catch(function(){ return null; }).then(function(rec){
    if (rec) epRestoreCached(rec);
  });
}
