// Storage for the notebook: IndexedDB, then localStorage, then memory. Each one is tried, with every call guarded.
// createStore() → Promise<{ kind, status, list(), put(rec), del(id), clear() }>; list/put/del/clear return promises.
const DB = 'arun11', STORE = 'notebook', LS_KEY = 'arun11.notebook', PROBE = 'probe-00000000';
const clone = o => JSON.parse(JSON.stringify(o));
const msg = e => String((e && (e.name || e.message)) || e).slice(0, 80);

function idbStore(idb) {
  const open = () => new Promise((res, rej) => {
    let done = false; const fin = (f, v) => { if (!done) { done = true; clearTimeout(timer); f(v); } };
    const timer = setTimeout(() => fin(rej, new Error('timeout')), 3000);
    let rq;
    try { rq = idb.open(DB, 1); } catch (e) { fin(rej, e); return; }
    rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE, { keyPath: 'experimentId' }); } catch (e) { fin(rej, e); } };
    rq.onsuccess = () => fin(res, rq.result);
    rq.onerror = () => fin(rej, rq.error || new Error('open failed'));
    rq.onblocked = () => fin(rej, new Error('blocked'));
  });
  return open().then(db => {
    const run = (mode, fn) => new Promise((res, rej) => {
      try {
        const tx = db.transaction(STORE, mode); const os = tx.objectStore(STORE);
        let out; const r = fn(os);
        if (r) r.onsuccess = () => { out = r.result; };
        tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error || new Error('transaction failed')); tx.onabort = () => rej(tx.error || new Error('aborted'));
      } catch (e) { rej(e); }
    });
    const api = {
      kind: 'indexeddb',
      list: () => run('readonly', os => os.getAll()).then(a => (a || []).filter(r => r && r.experimentId !== PROBE)),
      put: rec => run('readwrite', os => os.put(clone(rec))).then(() => undefined),
      del: id => run('readwrite', os => os.delete(id)).then(() => undefined),
      clear: () => run('readwrite', os => os.clear()).then(() => undefined),
    };
    // write test: a failing quota or a denied store shows here
    return api.put({ experimentId: PROBE }).then(() => api.del(PROBE)).then(() => api);
  });
}

function lsStore(ls) {
  const read = () => { try { const a = JSON.parse(ls.getItem(LS_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  const write = a => ls.setItem(LS_KEY, JSON.stringify(a));
  ls.setItem('arun11.probe', '1'); ls.removeItem('arun11.probe');
  read();
  const wrap = f => new Promise((res, rej) => { try { res(f()); } catch (e) { rej(e); } });
  return {
    kind: 'localstorage',
    list: () => wrap(read),
    put: rec => wrap(() => { const a = read().filter(r => r && r.experimentId !== rec.experimentId); a.push(clone(rec)); write(a); }),
    del: id => wrap(() => write(read().filter(r => r && r.experimentId !== id))),
    clear: () => wrap(() => { ls.removeItem(LS_KEY); }),
  };
}

function memStore() {
  const m = new Map();
  return {
    kind: 'memory',
    list: () => Promise.resolve([...m.values()].map(clone)),
    put: rec => { m.set(rec.experimentId, clone(rec)); return Promise.resolve(); },
    del: id => { m.delete(id); return Promise.resolve(); },
    clear: () => { m.clear(); return Promise.resolve(); },
  };
}

// opts.prefer limits the kinds tried, in order (tests use it). The result carries a status the UI shows.
export async function createStore(opts = {}) {
  const prefer = opts.prefer || ['indexeddb', 'localstorage'];
  const tried = [];
  for (const kind of prefer) {
    try {
      let s;
      if (kind === 'indexeddb') { const idb = globalThis.indexedDB; if (!idb) throw new Error('no IndexedDB'); s = await idbStore(idb); }
      else if (kind === 'localstorage') { const ls = globalThis.localStorage; if (!ls) throw new Error('no localStorage'); s = lsStore(ls); }
      if (s) { s.status = { kind: s.kind, persistent: true, tried }; return s; }
    } catch (e) { tried.push({ kind, error: msg(e) }); }
  }
  const s = memStore(); s.status = { kind: 'memory', persistent: false, tried };
  return s;
}

// A file to the person: a Blob behind an <a download>. Returns true when the click went out.
export function download(filename, text, type = 'application/json') {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* gone already */ } }, 4000);
    return true;
  } catch { return false; }
}

// A file from the person: resolves { text } | { error: 'big' | 'read' } | null when the picker is dismissed.
export function pickFile(accept = '.json,application/json', maxBytes = 512 * 1024) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none';
    const done = v => { i.remove(); res(v); };
    i.addEventListener('change', () => {
      const f = i.files && i.files[0];
      if (!f) return done(null);
      if (f.size > maxBytes) return done({ error: 'big' });
      const read = typeof f.text === 'function' ? f.text() : new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsText(f); });
      read.then(text => done({ text }), () => done({ error: 'read' }));
    });
    i.addEventListener('cancel', () => done(null));
    document.body.appendChild(i); i.click();
  });
}
