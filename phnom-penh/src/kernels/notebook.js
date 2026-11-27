// The local experiment notebook: records, strict validation, export and import. Pure: no DOM, no storage.
import { validateState, canonical, BASELINE_HASH, SCHEMA_VERSION, WORLD_ID } from './experiment.js';
import { KERNEL_VERSION } from './nowcast.js';
import { ADAPTER_VERSION } from './observe.js';

export const NOTEBOOK_FORMAT = 'arun-notebook';
export const RECORD_VERSION = 1;
export const LIMITS = { importBytes: 512 * 1024, records: 200, title: 80, notes: 2000, actions: 500, str: 40, keys: 40, inputs: 40 };
export const LOCALES = ['en', 'km', 'th'];

const RECORD_KEYS = ['schemaVersion', 'buildVersion', 'experimentId', 'seed', 'worldId', 'timestamp', 'locale', 'scenario', 'actions', 'baselineHash', 'provenance', 'outcome', 'uncertainty', 'title', 'notes'];
// The log entry types and the keys each one carries (from reduce/logEntry in experiment.js), plus undo, redo and load.
const ACTION_KEYS = {
  add: ['kind', 'x', 'y'], remove: ['id'], restore: ['id'], move: ['id', 'x', 'y'], kind: ['kind'], ring: ['ring'],
  hydro: ['key', 'value'], pump: ['value'], threshold: ['value'], obs: ['key', 'value'], seed: ['seed'], reset: [],
  undo: [], redo: [], load: [],
};
const ID_RE = /^[a-z0-9-]{8,40}$/;
const FIN = x => typeof x === 'number' && Number.isFinite(x);
const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const SHORT = /^[A-Za-z0-9_.-]{1,24}$/;

// ---- ids ----
let counter = 0;
export function newId() {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const b = c.getRandomValues(new Uint8Array(8));
    return [...b].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  counter = (counter + 1) % 46656;
  return 't' + Date.now().toString(36) + counter.toString(36).padStart(3, '0');
}

// ---- cleaning what the app hands over ----
// Metrics: finite numbers, null, short strings; objects at most 2 deep; anything else becomes null or is dropped.
export function cleanMetrics(v, depth = 0) {
  if (!isObj(v)) return {};
  const out = {};
  for (const k of Object.keys(v).slice(0, LIMITS.keys)) {
    if (!NAME_RE.test(k)) continue;
    const x = v[k];
    if (x === undefined) continue;
    if (FIN(x)) out[k] = x;
    else if (x === null || typeof x === 'number') out[k] = null;
    else if (typeof x === 'string') out[k] = x.slice(0, LIMITS.str);
    else if (typeof x === 'boolean') out[k] = x ? 1 : 0;
    else if (isObj(x) && depth < 2) out[k] = cleanMetrics(x, depth + 1);
  }
  return out;
}
export function cleanActions(log) {
  const out = [];
  for (const e of Array.isArray(log) ? log : []) {
    if (!isObj(e) || !(e.type in ACTION_KEYS)) continue;
    const o = { type: e.type };
    for (const k of ACTION_KEYS[e.type]) if (e[k] !== undefined) o[k] = e[k];
    out.push(o);
  }
  return out.slice(-LIMITS.actions);
}
const cut = (s, n) => String(s == null ? '' : s).slice(0, n);

// snapshot: { state, log, outcome, uncertainty, inputs? }
// meta: { title, notes, locale, buildVersion, now (Date | ISO string), id, inputs }
export function makeRecord(snapshot, meta = {}) {
  const s = snapshot.state;
  const now = meta.now instanceof Date ? meta.now : meta.now ? new Date(meta.now) : new Date();
  return {
    schemaVersion: RECORD_VERSION,
    buildVersion: cut(meta.buildVersion || 'unknown', LIMITS.str),
    experimentId: meta.id || newId(),
    seed: s.seed,
    worldId: s.worldId,
    timestamp: (Number.isFinite(+now) ? now : new Date()).toISOString(),
    locale: LOCALES.includes(meta.locale) ? meta.locale : 'en',
    scenario: JSON.parse(JSON.stringify(s)),
    actions: cleanActions(snapshot.log),
    baselineHash: BASELINE_HASH,
    provenance: {
      kernelVersion: KERNEL_VERSION, adapterVersion: ADAPTER_VERSION,
      inputs: (Array.isArray(meta.inputs || snapshot.inputs) ? (meta.inputs || snapshot.inputs) : []).slice(0, LIMITS.inputs)
        .filter(i => isObj(i)).map(i => ({ name: cut(i.name, LIMITS.str), kind: cut(i.kind, 24) })),
    },
    outcome: cleanMetrics(snapshot.outcome),
    uncertainty: cleanMetrics(snapshot.uncertainty),
    title: cut(meta.title, LIMITS.title),
    notes: cut(meta.notes, LIMITS.notes),
  };
}

// ---- validation ----
const extraKeys = (o, allowed) => Object.keys(o).filter(k => !allowed.includes(k));
function checkMetrics(v, where, e, depth = 0) {
  if (!isObj(v)) { e.push(`${where}: not an object`); return; }
  const ks = Object.keys(v);
  if (ks.length > LIMITS.keys) e.push(`${where}: more than ${LIMITS.keys} keys`);
  for (const k of ks) {
    const x = v[k], p = `${where}.${k}`;
    if (!NAME_RE.test(k)) e.push(`${where}: bad key name`);
    else if (x === null || FIN(x)) continue;
    else if (typeof x === 'string') { if (x.length > LIMITS.str) e.push(`${p}: text over ${LIMITS.str} characters`); }
    else if (isObj(x)) { if (depth >= 2) e.push(`${p}: nested too deep`); else checkMetrics(x, p, e, depth + 1); }
    else e.push(`${p}: wrong type`);
  }
}
function checkAction(a, i, e) {
  const p = `actions[${i}]`;
  if (!isObj(a) || typeof a.type !== 'string' || !(a.type in ACTION_KEYS)) { e.push(`${p}: unknown action type`); return; }
  const bad = extraKeys(a, ['type', ...ACTION_KEYS[a.type]]);
  if (bad.length) { e.push(`${p}: unknown key "${bad[0]}"`); return; }
  for (const k of ACTION_KEYS[a.type]) {
    const v = a[k]; if (v === undefined) continue;
    const ok = k === 'x' || k === 'y' ? FIN(v) && Math.abs(v) <= 60000
      : k === 'value' ? FIN(v)
        : k === 'seed' ? Number.isInteger(v) && v >= 1 && v <= 1e6
          : typeof v === 'string' && SHORT.test(v);
    if (!ok) e.push(`${p}.${k}: wrong type or value`);
  }
}

// Strict: every key present, no unknown keys. Text content is not judged; it is data and stays plain text.
export function validateRecord(o) {
  const e = [];
  if (!isObj(o)) return { ok: false, errors: ['record is not an object'], record: null };
  if (o.schemaVersion !== RECORD_VERSION) {
    e.push(versionMessage(o.schemaVersion));
    return { ok: false, errors: e, record: null };
  }
  const extra = extraKeys(o, RECORD_KEYS);
  if (extra.length) e.push(`unknown key "${extra[0].slice(0, 30)}"`);
  const missing = RECORD_KEYS.filter(k => !(k in o));
  if (missing.length) e.push(`missing key "${missing[0]}"`);
  if (missing.length) return { ok: false, errors: e, record: null };
  if (typeof o.buildVersion !== 'string' || !o.buildVersion || o.buildVersion.length > LIMITS.str) e.push('buildVersion');
  if (typeof o.experimentId !== 'string' || !ID_RE.test(o.experimentId)) e.push('experimentId');
  if (!Number.isInteger(o.seed) || o.seed < 1 || o.seed > 1e6) e.push('seed');
  if (o.worldId !== WORLD_ID) e.push('worldId');
  if (typeof o.timestamp !== 'string' || o.timestamp.length > 40 || !/^\d{4}-\d\d-\d\dT/.test(o.timestamp) || !Number.isFinite(Date.parse(o.timestamp))) e.push('timestamp');
  if (!LOCALES.includes(o.locale)) e.push('locale');
  const se = validateState(o.scenario);
  for (const m of se) e.push('scenario: ' + m);
  if (!se.length && o.scenario.seed !== o.seed) e.push('seed does not match the scenario');
  if (!Array.isArray(o.actions)) e.push('actions: not a list');
  else if (o.actions.length > LIMITS.actions) e.push(`actions: more than ${LIMITS.actions}`);
  else o.actions.forEach((a, i) => { if (e.length < 12) checkAction(a, i, e); });
  if (typeof o.baselineHash !== 'string' || !/^[0-9a-f]{8}$/.test(o.baselineHash)) e.push('baselineHash');
  const pv = o.provenance;
  if (!isObj(pv) || extraKeys(pv, ['kernelVersion', 'adapterVersion', 'inputs']).length || !('inputs' in pv)) e.push('provenance');
  else {
    if (typeof pv.kernelVersion !== 'string' || pv.kernelVersion.length > LIMITS.str) e.push('provenance.kernelVersion');
    if (typeof pv.adapterVersion !== 'string' || pv.adapterVersion.length > LIMITS.str) e.push('provenance.adapterVersion');
    if (!Array.isArray(pv.inputs) || pv.inputs.length > LIMITS.inputs || !pv.inputs.every(i => isObj(i) && Object.keys(i).length === 2 && typeof i.name === 'string' && i.name.length <= LIMITS.str && typeof i.kind === 'string' && i.kind.length <= 24)) e.push('provenance.inputs');
  }
  checkMetrics(o.outcome, 'outcome', e);
  checkMetrics(o.uncertainty, 'uncertainty', e);
  if (typeof o.title !== 'string') e.push('title: not text'); else if (o.title.length > LIMITS.title) e.push(`title: over ${LIMITS.title} characters`);
  if (typeof o.notes !== 'string') e.push('notes: not text'); else if (o.notes.length > LIMITS.notes) e.push(`notes: over ${LIMITS.notes} characters`);
  if (e.length) return { ok: false, errors: e, record: null };
  return { ok: true, errors: [], record: JSON.parse(JSON.stringify(o)) };
}

// ---- migration: older shapes become schemaVersion 1, in one visible step ----
const versionMessage = v => `Unsupported schemaVersion ${typeof v === 'number' || typeof v === 'string' ? String(v).slice(0, 12) : 'missing'}. This build reads versions 0 and ${RECORD_VERSION}.`;
export const MIGRATABLE = [0];
// Version 0 (a hypothetical early shape): { schemaVersion:0, id, name, note, when (ms), lang, seed, state, log, result }
export function migrate(r) {
  if (!isObj(r)) return r;
  if (r.schemaVersion === 0) {
    const when = FIN(r.when) ? new Date(r.when) : null;
    return {
      schemaVersion: 1, buildVersion: 'unknown', experimentId: r.id, seed: r.seed, worldId: WORLD_ID,
      timestamp: when && Number.isFinite(+when) ? when.toISOString() : r.timestamp,
      locale: r.lang, scenario: r.state, actions: r.log,
      baselineHash: '00000000', // the older shape did not record it
      provenance: { kernelVersion: 'unknown', adapterVersion: 'unknown', inputs: [] },
      outcome: r.result, uncertainty: {}, title: r.name, notes: r.note === undefined ? '' : r.note,
    };
  }
  return r;
}

// ---- export and import ----
export function toExport(records, { includeText = false } = {}) {
  const list = records.map((r, i) => includeText ? r : { ...r, title: `Experiment ${i + 1}`, notes: '' });
  return JSON.stringify({ format: NOTEBOOK_FORMAT, schemaVersion: RECORD_VERSION, includesText: !!includeText, records: list }, null, 1);
}

// existing: the notebook's records (or just their ids). Same id and same content is skipped; same id and other content
// (or ids given without content) gets a new id.
export function parseImport(text, existing = []) {
  const res = { ok: false, records: [], errors: [], migrated: 0, skipped: 0, renamed: 0 };
  if (typeof text !== 'string') { res.errors.push('no text'); return res; }
  const bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : text.length;
  if (bytes > LIMITS.importBytes) { res.errors.push(`File is over ${LIMITS.importBytes / 1024} KB.`); return res; }
  let doc;
  try { doc = JSON.parse(text); } catch { res.errors.push('File is not JSON.'); return res; }
  if (!isObj(doc) || doc.format !== NOTEBOOK_FORMAT) { res.errors.push(`File is not an ${NOTEBOOK_FORMAT} export.`); return res; }
  if (doc.schemaVersion !== RECORD_VERSION && !MIGRATABLE.includes(doc.schemaVersion)) { res.errors.push(versionMessage(doc.schemaVersion)); return res; }
  if (!Array.isArray(doc.records)) { res.errors.push('File has no list of records.'); return res; }
  if (doc.records.length > LIMITS.records) { res.errors.push(`File has more than ${LIMITS.records} records.`); return res; }
  res.ok = true;
  const seen = new Map(existing.map(x => typeof x === 'string' ? [x, null] : [x.experimentId, canonical(x)]));
  doc.records.forEach((raw, i) => {
    const from0 = isObj(raw) && MIGRATABLE.includes(raw.schemaVersion);
    const v = validateRecord(from0 ? migrate(raw) : raw);
    if (!v.ok) { res.errors.push(`Record ${i + 1}: ${v.errors.slice(0, 3).join('; ')}`); return; }
    let rec = v.record;
    if (seen.has(rec.experimentId)) {
      const prev = seen.get(rec.experimentId);
      if (prev !== null && prev === canonical(rec)) { res.skipped++; return; }
      let id; do { id = newId(); } while (seen.has(id));
      rec = { ...rec, experimentId: id }; res.renamed++;
    }
    seen.set(rec.experimentId, canonical(rec));
    if (from0) res.migrated++;
    res.records.push(rec);
  });
  return res;
}

// ---- list helpers ----
export const leadOf = r => { const v = r && r.outcome && r.outcome.net && r.outcome.net.prep; return FIN(v) ? v : null; };
export function sortRecords(list, by = 'newest') {
  const a = [...list];
  if (by === 'title') a.sort((x, y) => x.title.localeCompare(y.title, 'en', { numeric: true }) || y.timestamp.localeCompare(x.timestamp));
  else if (by === 'lead') a.sort((x, y) => { const p = leadOf(x), q = leadOf(y); return p === q ? 0 : p === null ? 1 : q === null ? -1 : q - p; });
  else a.sort((x, y) => y.timestamp.localeCompare(x.timestamp) || (x.experimentId < y.experimentId ? -1 : 1));
  return a;
}
export function duplicateRecord(r, { title, now } = {}) {
  const d = (now instanceof Date ? now : new Date()).toISOString();
  return { ...JSON.parse(JSON.stringify(r)), experimentId: newId(), timestamp: d, title: cut(title == null ? r.title : title, LIMITS.title) };
}
export { SCHEMA_VERSION };
