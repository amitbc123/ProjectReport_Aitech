/* Project Report — 17. Daily report folder (Chrome / Edge File System Access API)
   ------------------------------------------------------------
   The report filename carries a date that changes every month,
   and a second India file sits beside it. We list the folder,
   ignore anything containing "India", match ProjReport_D_M_YYYY.xml,
   and load the newest by the date embedded in the name.
   A browser cannot read a fixed path with zero interaction, so the
   folder is chosen once and remembered; later opens auto-load when
   the browser still holds permission, otherwise one click reloads. */
import { toast, handleFile } from './file-intake.js?v=20260813';
import { esc } from './format.js?v=20260813';

var MAIN_RE = /^ProjReport_(\d{1,2})_(\d{1,2})_(\d{4})\.xml$/i;

var folderbox  = document.getElementById("folderbox");
var folderBtn  = document.getElementById("folderBtn");
var folderStat = document.getElementById("folderStatus");
var reloadBtn  = document.getElementById("reloadFolderBtn");
var connectedDir = null;
var bootLoaded = false;

function fStatus(kind, msg){
  folderStat.className = "fb-status" + (kind ? " " + kind : "");
  folderStat.textContent = msg;
}
function markConnected(){
  reloadBtn.hidden = false;
  folderbox.classList.remove("off");
}

var IDB_NAME = "aitech-report", IDB_STORE = "handles", IDB_FILES = "files", IDB_KEY = "dailyFolder", IDB_FILEKEY = "lastFile";
function idbOpen(){
  return new Promise(function(res, rej){
    if (!window.indexedDB) return rej();
    var rq = indexedDB.open(IDB_NAME, 2);
    rq.onupgradeneeded = function(){
      var db = rq.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_FILES)) db.createObjectStore(IDB_FILES);
    };
    rq.onsuccess = function(){ res(rq.result); };
    rq.onerror   = function(){ rej(); };
  });
}
function idbGetFile(){
  return idbOpen().then(function(db){
    return new Promise(function(res){
      try{
        var rq = db.transaction(IDB_FILES, "readonly").objectStore(IDB_FILES).get(IDB_FILEKEY);
        rq.onsuccess = function(){ res(rq.result || null); };
        rq.onerror   = function(){ res(null); };
      }catch(e){ res(null); }
    });
  }).catch(function(){ return null; });
}
function idbSetFile(val){
  return idbOpen().then(function(db){
    return new Promise(function(res){
      try{
        var tx = db.transaction(IDB_FILES, "readwrite");
        tx.objectStore(IDB_FILES).put(val, IDB_FILEKEY);
        tx.oncomplete = function(){ res(true); };
        tx.onerror    = function(){ res(false); };
      }catch(e){ res(false); }
    });
  }).catch(function(){ return false; });
}
// Best effort: remember the last file so reopening (including on iPhone,
// where the folder API does not exist) restores the last report.
export function cacheFile(file){
  try{ idbSetFile({ name:file.name, ts:Date.now(), blob:file }); }catch(e){}
}
function restoreCached(rec){
  var f;
  try{ f = new File([rec.blob], rec.name || "report.xml", { type:(rec.blob && rec.blob.type) || "" }); }
  catch(e){ f = rec.blob; try{ f.name = rec.name; }catch(_){} }
  toast('Showing the last file you loaded' + (rec.name ? ' (<b>'+esc(rec.name)+'</b>)' : '') +
        (rec.ts ? ', saved '+new Date(rec.ts).toLocaleString() : '') +
        '. Tap <b>Choose file</b> to load a newer one.', "info");
  handleFile(f);
}
function idbGet(){
  return idbOpen().then(function(db){
    return new Promise(function(res){
      try{
        var rq = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(IDB_KEY);
        rq.onsuccess = function(){ res(rq.result || null); };
        rq.onerror   = function(){ res(null); };
      }catch(e){ res(null); }
    });
  }).catch(function(){ return null; });
}
function idbSet(val){
  return idbOpen().then(function(db){
    return new Promise(function(res){
      try{
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(val, IDB_KEY);
        tx.oncomplete = function(){ res(true); };
        tx.onerror    = function(){ res(false); };
      }catch(e){ res(false); }
    });
  }).catch(function(){ return false; });
}

// Newest ProjReport_D_M_YYYY.xml, India file always excluded.
function pickReportName(names){
  var best = null;
  names.forEach(function(name){
    if (/india/i.test(name)) return;
    var m = MAIN_RE.exec(name);
    if (!m) return;
    var key = (+m[3]) * 10000 + (+m[2]) * 100 + (+m[1]);
    if (!best || key > best.key || (key === best.key && name > best.name)) best = { name:name, key:key };
  });
  return best ? best.name : null;
}

function loadFromDirectory(dir){
  bootLoaded = true;
  var names = [], byName = {};
  return (async function(){
    for await (var entry of dir.values()){
      if (entry.kind === "file"){ names.push(entry.name); byName[entry.name] = entry; }
    }
  })().then(function(){
    var target = pickReportName(names);
    if (!target){
      fStatus("err", "No file matching ProjReport_<date>.xml was found here. The India file is always ignored.");
      return;
    }
    return byName[target].getFile().then(function(file){
      fStatus("ok", "Loaded " + target);
      handleFile(file);
    });
  });
}

function connectFolder(){
  return window.showDirectoryPicker({ id:"aitechDaily", mode:"read", startIn:"desktop" })
    .then(function(dir){
      connectedDir = dir;
      return idbSet(dir).then(function(){ markConnected(); return loadFromDirectory(dir); });
    })
    .catch(function(e){ if (e && e.name === "AbortError") return; fStatus("err", "Could not open the folder."); });
}

function reloadFromFolder(){
  var p = connectedDir ? Promise.resolve(connectedDir) : idbGet();
  return p.then(function(dir){
    if (!dir) return connectFolder();
    connectedDir = dir; markConnected();
    return dir.queryPermission({ mode:"read" }).then(function(perm){
      if (perm === "granted") return loadFromDirectory(dir);
      return dir.requestPermission({ mode:"read" }).then(function(p2){
        if (p2 === "granted") return loadFromDirectory(dir);
        fStatus("err", "Permission to read the folder was denied.");
      });
    });
  }).catch(function(){ fStatus("err", "Could not read the folder."); });
}

function initFolder(){
  if (!window.showDirectoryPicker){
    folderBtn.hidden = true;
    fStatus("", "Folder auto-loading works in desktop Chrome or Edge. On this device, use Choose file below.");
    return Promise.resolve(false);
  }
  folderBtn.addEventListener("click", reloadFromFolder);
  reloadBtn.addEventListener("click", reloadFromFolder);
  return idbGet().then(function(dir){
    if (!dir){
      folderBtn.textContent = "Connect folder";
      fStatus("", "Point the app at the folder once. It is remembered from then on.");
      return false;
    }
    connectedDir = dir; markConnected();
    folderBtn.textContent = "Load latest report";
    return dir.queryPermission({ mode:"read" }).then(function(perm){
      if (perm === "granted"){ fStatus("", "Loading the latest report\u2026"); return loadFromDirectory(dir).then(function(){ return true; }); }
      fStatus("ready", "Ready. Click to load the latest report from the folder.");
      return false;
    });
  }).catch(function(){
    folderBtn.textContent = "Connect folder";
    fStatus("", "Point the app at the folder once. It is remembered from then on.");
    return false;
  });
}
// On open: prefer a fresh pull from the connected folder (desktop Chrome/Edge);
// otherwise fall back to the last file we cached (works on iPhone too).
export function bootstrap(){
  Promise.resolve(initFolder()).then(function(started){
    if (started || bootLoaded) return;
    idbGetFile().then(function(rec){
      if (rec && !bootLoaded){ bootLoaded = true; restoreCached(rec); }
    }).catch(function(){});
  });
}
