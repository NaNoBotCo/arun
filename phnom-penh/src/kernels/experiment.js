// An experiment: one immutable state, changed only by actions, with undo/redo and a log of actions.
// The baseline (the city as the demo opens) is frozen; every experiment is a branch from it.
import { HYDRO } from './hydro.js';
import { OBS_DEFAULTS } from './observe.js';

export const SCHEMA_VERSION = 1;
export const WORLD_ID = 'phnom-penh';
export const KINDS_FAC = ['hotel', 'hospital', 'datahall'];
export const RINGS = ['city', 'sub', 'region'];
export const ADD_KINDS = ['gauge', 'camera'];
export const MAX_ADDED = 40;
// Assumed prices for the Build tools and the budget challenge (US$, installed, first year). Not quotes.
export const PRICES = { gauge: 600, camera: 150 };

const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
export const BASELINE = deepFreeze({
  schemaVersion: SCHEMA_VERSION, worldId: WORLD_ID, seed: 1,
  facility: { x: -1500, y: -600, kind: 'hotel' }, ring: 'region', off: [], added: [],
  hydro: { ...HYDRO }, extra: { pumpM3min: 0 }, warnP: 0.5, obs: { ...OBS_DEFAULTS },
});

const fin = x => typeof x === 'number' && Number.isFinite(x);
const inBox = (x, y) => fin(x) && fin(y) && Math.abs(x) <= 60000 && Math.abs(y) <= 60000;
const ID = /^[a-z][a-z0-9]{0,7}$/;
const LIMITS = { catchHa: [1, 500], runoff: [0.05, 1], drainMmH: [1, 120], pondHa: [0.05, 50], kerbCm: [1, 100] };
const OBS_LIMITS = { fieldError: [0, 2], drop: [0, 0.9], delay: [0, 60], noiseScale: [0, 10] };
const keysAre = (o, ks) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === ks.length && ks.every(k => k in o);

// Returns a list of problems; empty means the state is valid. Unknown keys are problems.
export function validateState(s) {
  const e = [];
  if (!keysAre(s, Object.keys(BASELINE))) return ['state keys'];
  if (s.schemaVersion !== SCHEMA_VERSION) e.push('schemaVersion');
  if (s.worldId !== WORLD_ID) e.push('worldId');
  if (!Number.isInteger(s.seed) || s.seed < 1 || s.seed > 1e6) e.push('seed');
  if (!keysAre(s.facility, ['x', 'y', 'kind']) || !inBox(s.facility.x, s.facility.y) || !KINDS_FAC.includes(s.facility.kind)) e.push('facility');
  if (!RINGS.includes(s.ring)) e.push('ring');
  if (!Array.isArray(s.off) || s.off.length > 200 || !s.off.every(id => typeof id === 'string' && ID.test(id))) e.push('off');
  if (!Array.isArray(s.added) || s.added.length > MAX_ADDED || !s.added.every(a => keysAre(a, ['id', 'kind', 'x', 'y']) && ID.test(a.id) && ADD_KINDS.includes(a.kind) && inBox(a.x, a.y))) e.push('added');
  else if (new Set(s.added.map(a => a.id)).size !== s.added.length) e.push('added ids');
  if (!keysAre(s.hydro, Object.keys(LIMITS)) || !Object.entries(LIMITS).every(([k, [lo, hi]]) => fin(s.hydro[k]) && s.hydro[k] >= lo && s.hydro[k] <= hi)) e.push('hydro');
  if (!keysAre(s.extra, ['pumpM3min']) || !fin(s.extra.pumpM3min) || s.extra.pumpM3min < 0 || s.extra.pumpM3min > 1000) e.push('extra');
  if (!fin(s.warnP) || s.warnP < 0.05 || s.warnP > 1) e.push('warnP');
  if (!keysAre(s.obs, Object.keys(OBS_LIMITS)) || !Object.entries(OBS_LIMITS).every(([k, [lo, hi]]) => fin(s.obs[k]) && s.obs[k] >= lo && s.obs[k] <= hi) || !Number.isInteger(s.obs.delay)) e.push('obs');
  return e;
}

const clone = s => JSON.parse(JSON.stringify(s));
const nextId = s => { let n = 0; for (const a of s.added) { const m = /^n(\d+)$/.exec(a.id); if (m) n = Math.max(n, +m[1]); } return 'n' + (n + 1); };
const round = v => Math.round(v);

// Pure: state × action → new state. Throws on an action that does not apply.
export function reduce(s0, a) {
  const s = clone(s0);
  switch (a && a.type) {
    case 'add': {
      if (!ADD_KINDS.includes(a.kind) || !inBox(a.x, a.y)) throw new Error('add: bad');
      if (s.added.length >= MAX_ADDED) throw new Error('add: limit');
      s.added.push({ id: nextId(s), kind: a.kind, x: round(a.x), y: round(a.y) }); break;
    }
    case 'remove': {
      const i = s.added.findIndex(x => x.id === a.id);
      if (i >= 0) s.added.splice(i, 1);
      else if (typeof a.id === 'string' && ID.test(a.id) && !s.off.includes(a.id)) { s.off.push(a.id); s.off.sort(); }
      else throw new Error('remove: ' + a.id);
      break;
    }
    case 'restore': { const i = s.off.indexOf(a.id); if (i < 0) throw new Error('restore: ' + a.id); s.off.splice(i, 1); break; }
    case 'move': {
      if (!inBox(a.x, a.y)) throw new Error('move: bad');
      if (a.id === 'fac') { s.facility.x = round(a.x); s.facility.y = round(a.y); break; }
      const t = s.added.find(x => x.id === a.id); if (!t) throw new Error('move: ' + a.id);
      t.x = round(a.x); t.y = round(a.y); break;
    }
    case 'kind': if (!KINDS_FAC.includes(a.kind)) throw new Error('kind'); s.facility.kind = a.kind; break;
    case 'ring': if (!RINGS.includes(a.ring)) throw new Error('ring'); s.ring = a.ring; break;
    case 'hydro': if (!(a.key in LIMITS)) throw new Error('hydro'); s.hydro[a.key] = a.value; break;
    case 'pump': s.extra.pumpM3min = a.value; break;
    case 'threshold': s.warnP = a.value; break;
    case 'obs': if (!(a.key in OBS_LIMITS)) throw new Error('obs'); s.obs[a.key] = a.value; break;
    case 'seed': s.seed = a.seed; break;
    case 'reset': return clone(BASELINE);
    case 'load': { const e = validateState(a.state); if (e.length) throw new Error('load: ' + e.join(',')); return clone(a.state); }
    default: throw new Error('unknown action ' + (a && a.type));
  }
  const e = validateState(s); if (e.length) throw new Error('action makes a bad state: ' + e.join(','));
  return s;
}

// The action as it goes in the log: its type and plain numbers or names, nothing else.
const LOG_KEYS = ['type', 'kind', 'id', 'x', 'y', 'ring', 'key', 'value', 'seed'];
export const logEntry = a => Object.fromEntries(LOG_KEYS.filter(k => a[k] !== undefined).map(k => [k, a[k]]));

export function history(state = BASELINE) { return { past: [], present: clone(state), future: [], log: [] }; }
export function apply(h, a) { const present = reduce(h.present, a); return { past: [...h.past, h.present].slice(-200), present, future: [], log: [...h.log, logEntry(a === undefined ? {} : a.type === 'load' ? { type: 'load' } : a)].slice(-500) }; }
export function undo(h) { if (!h.past.length) return h; return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], log: [...h.log, { type: 'undo' }].slice(-500) }; }
export function redo(h) { if (!h.future.length) return h; return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), log: [...h.log, { type: 'redo' }].slice(-500) }; }
// Replays a log from the baseline (or a given start); undo/redo entries replay too. Returns every state along the way.
export function replayLog(log, start = BASELINE) {
  let h = history(start); const states = [h.present];
  for (const e of log) { h = e.type === 'undo' ? undo(h) : e.type === 'redo' ? redo(h) : e.type === 'load' ? h : apply(h, e); states.push(h.present); }
  return states;
}

// Canonical JSON (keys sorted) and its FNV-1a hash: the same state gives the same hash on every device.
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export function hashState(s) {
  let h = 2166136261 >>> 0; const str = canonical(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export const BASELINE_HASH = hashState(BASELINE);

// Sensors active in a state: proposed ones in the ring and not switched off, plus added ones.
export function activeSensors(state, proposed) {
  const ringOf = s => s.ring === 'region' ? 'region' : (Math.hypot(s.x, s.y) < 5200 ? 'city' : 'sub');
  const ok = { city: ['city'], sub: ['city', 'sub'], region: ['city', 'sub', 'region'] }[state.ring];
  return [...proposed.filter(s => ok.includes(ringOf(s))), ...state.added].map(s => ({ id: s.id, kind: s.kind, ring: s.ring, x: s.x, y: s.y, on: !state.off.includes(s.id) }));
}
// Assumed network cost of a state: every active sensor at its assumed price.
export function costOf(state, proposed, prices = PRICES) {
  const on = activeSensors(state, proposed).filter(s => s.on);
  const n = { gauge: on.filter(s => s.kind === 'gauge').length, camera: on.filter(s => s.kind === 'camera').length };
  return { ...n, usd: n.gauge * prices.gauge + n.camera * prices.camera };
}
// The scenario config the kernels take, from a state.
export function configOf(state, proposed) {
  return { seed: state.seed, sensors: activeSensors(state, proposed), facility: state.facility, hydro: state.hydro, extra: state.extra, warnP: state.warnP, obsOpts: state.obs };
}
