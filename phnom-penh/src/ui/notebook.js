// The experiment notebook: save, list, open, replay, rename, duplicate, delete, compare, show, export, import.
// mount(container, C) → cleanup.
// Reads: C.exp.state(), C.exp.log(), C.exp.metrics(), C.exp.load/replay/show/compare, C.BUILD ({version, edition}), C.exp.inputs() if present.
import { h, txt, btn } from './kit.js';
import { t, num, getLang } from '../i18n.js';
import '../words/notebook.js';
import { makeRecord, validateRecord, toExport, parseImport, sortRecords, duplicateRecord, leadOf, LIMITS } from '../kernels/notebook.js';
import { createStore, download, pickFile } from './store.js';

const pad = n => String(n).padStart(2, '0');
const when = iso => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const STORE_KEY = { indexeddb: 'nb_store_idb', localstorage: 'nb_store_ls', memory: 'nb_store_mem' };

export function mount(container, C) {
  const root = h('div', 'lens nb');
  container.appendChild(root);
  let store = null, records = [], corrupt = 0, sort = 'newest', confirmId = null, renameId = null;
  let cmp = [], show = [], inc = false, message = '', report = null, dead = false;

  const say = (key, vars) => { message = key ? t(key, vars) : ''; paintMsg(); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const build = () => { const b = C.BUILD || {}; return [b.version, b.edition].filter(Boolean).join(' '); };
  const defaultTitle = () => t('nb_default_title', { n: num(records.length + 1) });

  async function refresh() {
    if (!store) return;
    try {
      const all = await store.list(); corrupt = 0;
      records = all.map(r => { const v = validateRecord(r); if (!v.ok) corrupt++; return v.record; }).filter(Boolean);
    } catch { records = []; }
    cmp = cmp.filter(id => records.some(r => r.experimentId === id));
    show = show.filter(id => records.some(r => r.experimentId === id));
    if (!dead) paint();
  }

  // ---- parts ----
  const status = txt('p', 'note nb-status', '');
  const msgEl = txt('p', 'nb-msg', ''); msgEl.setAttribute('role', 'status');
  function paintMsg() { msgEl.textContent = message; msgEl.hidden = !message; }

  const titleIn = h('input', 'nb-in'); titleIn.type = 'text'; titleIn.maxLength = LIMITS.title; titleIn.setAttribute('aria-label', t('nb_title_ph'));
  const notesIn = h('textarea', 'nb-in nb-notes'); notesIn.maxLength = LIMITS.notes; notesIn.rows = 3; notesIn.placeholder = t('nb_notes_ph'); notesIn.setAttribute('aria-label', t('nb_notes_ph'));
  const saveBtn = btn(t('nb_save'), false, 'go');
  saveBtn.addEventListener('click', async () => {
    if (!store) return;
    try {
      const m = C.exp.metrics() || {};
      const rec = makeRecord(
        { state: C.exp.state(), log: C.exp.log(), outcome: m.outcome, uncertainty: m.uncertainty },
        { title: titleIn.value.trim() || defaultTitle(), notes: notesIn.value, locale: getLang(), buildVersion: build(), inputs: typeof C.exp.inputs === 'function' ? C.exp.inputs() : [] });
      const v = validateRecord(rec); if (!v.ok) { say('nb_err_save'); return; }
      await store.put(v.record);
      titleIn.value = ''; notesIn.value = '';
      await refresh();
      say(store.status.persistent ? 'nb_saved_ok' : 'nb_saved_mem');
    } catch { say('nb_err_save'); }
  });
  const saveBox = h('div', 'nb-save');
  saveBox.append(txt('h3', '', t('nb_save_h')), titleIn, notesIn, h('div', 'row'));
  saveBox.lastChild.append(saveBtn);

  const sortRow = h('div', 'row nb-sort');
  for (const [k, key] of [['newest', 'nb_sort_new'], ['title', 'nb_sort_title'], ['lead', 'nb_sort_lead']]) {
    const b = btn(t(key), sort === k); b.dataset.sort = k; b.setAttribute('aria-pressed', sort === k);
    b.addEventListener('click', () => { sort = k; paint(); });
    sortRow.append(b);
  }

  const goRow = h('div', 'row nb-go');
  const list = h('div', 'nb-list');

  const expBox = h('div', 'nb-io');
  const incLabel = h('label', 'nb-inc'); const incBox = h('input'); incBox.type = 'checkbox'; incBox.checked = inc;
  incLabel.append(incBox, txt('span', '', t('nb_text_inc')));
  const incNote = txt('p', 'note', '');
  const syncInc = () => { incNote.textContent = t(inc ? 'nb_text_on' : 'nb_text_off'); };
  incBox.addEventListener('change', () => { inc = incBox.checked; syncInc(); });
  syncInc();
  const exportBtn = btn(t('nb_export'));
  exportBtn.addEventListener('click', () => {
    const sel = sortRecords(records, 'newest').reverse();
    if (!sel.length) return;
    const ok = download(`arun-notebook-${new Date().toISOString().slice(0, 10)}.json`, toExport(sel, { includeText: inc }));
    say(ok ? 'nb_exported' : 'nb_dl_fail', { n: num(sel.length) });
  });
  const importBtn = btn(t('nb_import'));
  importBtn.addEventListener('click', async () => {
    const f = await pickFile('.json,application/json', LIMITS.importBytes);
    if (!f) return;
    if (f.error) { report = { fatal: [t(f.error === 'big' ? 'nb_err_big' : 'nb_err_read')] }; paintReport(); return; }
    const r = parseImport(f.text, records);
    let added = 0;
    if (r.ok) for (const rec of r.records) { try { await store.put(rec); added++; } catch { r.errors.push(t('nb_err_save')); break; } }
    report = { r, added };
    await refresh(); paintReport();
  });
  const ioRow = h('div', 'row'); ioRow.append(exportBtn, importBtn);
  const repEl = h('div', 'nb-report'); repEl.setAttribute('role', 'status');
  expBox.append(incLabel, incNote, ioRow, repEl);
  function paintReport() {
    repEl.textContent = ''; if (!report) return;
    if (report.fatal) { for (const m of report.fatal) repEl.append(txt('p', '', m)); return; }
    const { r, added } = report;
    repEl.append(txt('p', '', t('nb_imported', { n: num(added) })));
    const bits = [];
    if (r.skipped) bits.push(t('nb_skipped', { n: num(r.skipped) }));
    if (r.renamed) bits.push(t('nb_renamed', { n: num(r.renamed) }));
    if (r.migrated) bits.push(t('nb_migrated', { n: num(r.migrated) }));
    if (bits.length) repEl.append(txt('p', 'note', bits.join(' ')));
    if (r.errors.length) {
      repEl.append(txt('p', '', t('nb_rejected', { n: num(r.errors.length) })));
      const ul = h('ul', 'nb-errs'); for (const e of r.errors.slice(0, 10)) ul.append(txt('li', '', e)); repEl.append(ul);
    }
  }

  root.append(txt('h2', '', t('nb_title')), status, msgEl, saveBox, sortRow, goRow, list, expBox);
  paintMsg();

  // ---- list ----
  function row(r) {
    const el = h('div', 'nb-row'); el.dataset.id = r.experimentId;
    const lead = leadOf(r);
    if (renameId === r.experimentId) {
      const inp = h('input', 'nb-in'); inp.type = 'text'; inp.maxLength = LIMITS.title; inp.value = r.title; inp.setAttribute('aria-label', t('nb_rename'));
      const ok = btn(t('nb_save'), false, 'go'), no = btn(t('nb_cancel'));
      ok.addEventListener('click', async () => { try { await store.put({ ...r, title: inp.value.trim().slice(0, LIMITS.title) || r.title }); } catch { say('nb_err_save'); } renameId = null; await refresh(); });
      no.addEventListener('click', () => { renameId = null; paint(); });
      const rr = h('div', 'row'); rr.append(ok, no); el.append(inp, rr);
      return el;
    }
    el.append(txt('div', 'nb-t', r.title));
    el.append(txt('div', 'note', [when(r.timestamp), t('nb_seed', { n: num(r.seed) }), lead == null ? '–' : t('nb_lead', { n: num(lead, Number.isInteger(lead) ? 0 : 1) })].join(' · ')));
    const bar = h('div', 'row');
    if (confirmId === r.experimentId) {
      const q = txt('span', 'nb-ask', t('nb_del_ask'));
      const yes = btn(t('nb_del'), false, 'go'), no = btn(t('nb_cancel'));
      yes.dataset.act = 'delete-yes';
      yes.addEventListener('click', async () => { try { await store.del(r.experimentId); } catch { say('nb_err_save'); } confirmId = null; await refresh(); });
      no.addEventListener('click', () => { confirmId = null; paint(); });
      bar.append(q, yes, no);
    } else {
      const mk = (key, act, fn, on) => { const b = btn(t(key), on); b.dataset.act = act; if (on !== undefined) b.setAttribute('aria-pressed', !!on); b.addEventListener('click', fn); bar.append(b); return b; };
      mk('nb_open', 'open', () => C.exp.load(clone(r)));
      mk('nb_replay', 'replay', () => C.exp.replay(clone(r)));
      mk('nb_rename', 'rename', () => { renameId = r.experimentId; paint(); });
      mk('nb_dup', 'dup', async () => { try { await store.put(duplicateRecord(r)); } catch { say('nb_err_save'); } await refresh(); });
      mk('nb_del', 'delete', () => { confirmId = r.experimentId; paint(); });
      mk('nb_cmp', 'cmp', () => { cmp = cmp.includes(r.experimentId) ? cmp.filter(x => x !== r.experimentId) : [...cmp, r.experimentId].slice(-2); paint(); }, cmp.includes(r.experimentId));
      mk('nb_show', 'show', () => { show = show.includes(r.experimentId) ? show.filter(x => x !== r.experimentId) : [...show, r.experimentId]; paint(); }, show.includes(r.experimentId));
    }
    el.append(bar);
    return el;
  }

  function paint() {
    if (dead) return;
    status.textContent = store ? t(STORE_KEY[store.kind]) : '';
    titleIn.placeholder = defaultTitle();
    for (const b of sortRow.children) { const on = b.dataset.sort === sort; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
    list.textContent = '';
    const rows = sortRecords(records, sort);
    if (!rows.length) list.append(txt('p', 'note', t('nb_empty')));
    for (const r of rows) list.append(row(r));
    if (corrupt) list.append(txt('p', 'note', t('nb_corrupt', { n: num(corrupt) })));
    goRow.textContent = '';
    const go = btn(t('nb_cmp_go'), false, 'go'); go.disabled = cmp.length !== 2; go.dataset.act = 'compare-go';
    go.addEventListener('click', () => { const [a, b] = cmp.map(id => records.find(r => r.experimentId === id)); if (a && b) C.exp.compare(clone(a), clone(b)); });
    const sg = btn(t('nb_show_go', { n: num(show.length) }), false, 'go'); sg.disabled = !show.length; sg.dataset.act = 'show-go';
    sg.addEventListener('click', () => { C.exp.show(show.map(id => records.find(r => r.experimentId === id)).filter(Boolean).map(clone)); });
    goRow.append(go, sg);
    exportBtn.disabled = !records.length;
  }

  paint();
  createStore().then(s => { if (dead) return; store = s; return refresh(); });

  return () => { dead = true; root.remove(); };
}
