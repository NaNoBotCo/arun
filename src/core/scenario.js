// Shared scenario for the flagship watershed. Every change makes a new immutable version;
// results carry the hash of the inputs that produced them, so a stale result shows as stale.

import { hashData } from './hash.js';

export const SCENARIO_SCHEMA = 'arun-scenario/1';
export const MODEL_VERSION = 'arun-flagship-1.0.0';

// Allowed ranges for every shared input. Import and UI both check against this table.
export const SCENARIO_FIELDS = {
  seed: { min: 0, max: 4294967295, integer: true },
  'hydro.stormIntensity_mm_h': { min: 0, max: 150, unit: 'mm/h' },
  'hydro.stormDuration_h': { min: 0, max: 24, unit: 'h' },
  'hydro.inflow_m3_s': { min: 0, max: 60, unit: 'm³/s' },
  'hydro.retentionCapacity_m3': { min: 0, max: 2000000, unit: 'm³' },
  'hydro.imperviousness': { min: 0, max: 1, unit: 'fraction' },
  'hydro.drainage_mm_h': { min: 0, max: 60, unit: 'mm/h' },
  'hydro.interventionX': { min: 0, max: 1, unit: 'grid fraction' },
  'hydro.interventionY': { min: 0, max: 1, unit: 'grid fraction' },
  'hydro.interventionRadius_cells': { min: 1, max: 14, integer: true, unit: 'cells' },
  'hydro.timestep_s': { min: 1, max: 60, unit: 's' },
  'hydro.simHours': { min: 2, max: 48, unit: 'h' },
  'hydro.grid': { min: 48, max: 160, integer: true, unit: 'cells per side' },
  'hydro.forcingMultiplier': { min: 0.5, max: 2, unit: 'factor' },
};

export function defaultScenario() {
  return {
    schema: SCENARIO_SCHEMA,
    modelVersion: MODEL_VERSION,
    seed: 20261125,
    region: {
      id: 'mekong-fictional-v1',
      label: 'Fictional Mekong-style watershed',
      cellSize_m: 100,
      timeZone: 'UTC+07:00 (fictional local time)',
      dataStatus: 'SYNTHETIC',
    },
    hydro: {
      grid: 96,
      stormIntensity_mm_h: 45,
      stormDuration_h: 5,
      inflow_m3_s: 4,
      retentionCapacity_m3: 1000000,
      imperviousness: 0.6,
      drainage_mm_h: 6,
      interventionX: 0.59,
      interventionY: 0.44,
      interventionRadius_cells: 7,
      timestep_s: 10,
      simHours: 16,
      // 1 = no correction. E04 can set this through an explicitly labelled synthetic mapping.
      forcingMultiplier: 1,
      forcingSource: 'none',
    },
  };
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

export function validateScenario(s) {
  const errors = [];
  if (!s || typeof s !== 'object') return { ok: false, errors: ['The file is not a scenario object.'] };
  if (s.schema !== SCENARIO_SCHEMA)
    errors.push(`Schema is "${String(s.schema).slice(0, 40)}"; this version reads "${SCENARIO_SCHEMA}". Export a fresh scenario from this site and edit that.`);
  for (const [path, rule] of Object.entries(SCENARIO_FIELDS)) {
    const v = getPath(s, path);
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`${path} must be a number (got ${JSON.stringify(v)}).`);
      continue;
    }
    if (v < rule.min || v > rule.max) errors.push(`${path} = ${v} is outside ${rule.min}–${rule.max} ${rule.unit || ''}.`.trim());
    if (rule.integer && !Number.isInteger(v)) errors.push(`${path} must be a whole number.`);
  }
  return { ok: errors.length === 0, errors };
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

export class ScenarioStore {
  constructor(initial = defaultScenario()) {
    this.state = deepFreeze(structuredClone(initial));
    this.version = 1;
    this.results = new Map();
    this.subs = new Set();
    this.history = [];
  }

  get() {
    return this.state;
  }

  // Inputs that matter to one section, hashed together with seed, region and model version.
  inputHash(section) {
    const s = this.state;
    return hashData({ section, data: s[section], seed: s.seed, region: s.region.id, model: s.modelVersion });
  }

  set(path, value, source = 'user') {
    const rule = SCENARIO_FIELDS[path];
    if (rule) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} needs a number.`);
      if (value < rule.min || value > rule.max) throw new Error(`${path} must be between ${rule.min} and ${rule.max}.`);
      if (rule.integer && !Number.isInteger(value)) throw new Error(`${path} must be a whole number.`);
    }
    if (getPath(this.state, path) === value) return false;
    const next = structuredClone(this.state);
    setPath(next, path, value);
    this.commit(next, { path, source });
    return true;
  }

  patch(entries, source = 'user') {
    const next = structuredClone(this.state);
    let changed = false;
    for (const [path, value] of Object.entries(entries)) {
      const rule = SCENARIO_FIELDS[path];
      if (rule && (value < rule.min || value > rule.max)) throw new Error(`${path} must be between ${rule.min} and ${rule.max}.`);
      if (getPath(next, path) !== value) {
        setPath(next, path, value);
        changed = true;
      }
    }
    if (changed) this.commit(next, { path: Object.keys(entries).join(','), source });
    return changed;
  }

  commit(next, change) {
    this.state = deepFreeze(next);
    this.version += 1;
    this.history.push({ version: this.version, ...change, at: Date.now() });
    if (this.history.length > 200) this.history.shift();
    for (const fn of this.subs) fn(this.state, change);
  }

  subscribe(fn) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  putResult(exId, entry) {
    this.results.set(exId, { ...entry, storedAt: Date.now() });
    for (const fn of this.subs) fn(this.state, { path: `result:${exId}`, source: exId });
  }

  getResult(exId) {
    return this.results.get(exId) || null;
  }

  // A result is current only if the inputs that made it match the scenario now.
  resultStatus(exId, section) {
    const r = this.results.get(exId);
    if (!r) return { state: 'missing', result: null };
    const now = this.inputHash(section);
    return { state: r.inputHash === now ? 'current' : 'stale', result: r, expected: now };
  }

  exportJSON() {
    return JSON.stringify({ ...this.state, exportedAt: new Date().toISOString() }, null, 2);
  }

  importJSON(text) {
    let parsed;
    if (typeof text !== 'string' || text.length > 200000) return { ok: false, errors: ['File is larger than 200 KB; a scenario is a few kilobytes.'] };
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, errors: ['The file is not valid JSON: ' + e.message] };
    }
    const base = defaultScenario();
    const merged = {
      schema: parsed.schema,
      modelVersion: MODEL_VERSION,
      seed: parsed.seed,
      region: base.region,
      hydro: { ...base.hydro, ...(parsed.hydro || {}) },
    };
    if (typeof merged.hydro.forcingSource !== 'string') merged.hydro.forcingSource = 'none';
    merged.hydro.forcingSource = merged.hydro.forcingSource.replace(/[^a-zA-Z0-9 :._-]/g, '').slice(0, 60);
    const v = validateScenario(merged);
    if (!v.ok) return v;
    this.commit(merged, { path: '*', source: 'import' });
    this.results.clear();
    return { ok: true, errors: [] };
  }

  reset() {
    this.results.clear();
    this.commit(defaultScenario(), { path: '*', source: 'reset' });
  }
}

export const scenario = new ScenarioStore();
