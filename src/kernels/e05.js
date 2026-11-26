// E05 Minimum Knowledge: a disjoint histogram released with Laplace noise under a fixed privacy budget.
// Synthetic people only. Demonstration ledger: in memory, one page; not production privacy accounting.

import { makeRng, deriveSeed } from '../core/rng.js';

export const METHOD_VERSION = 'e05-laplace-ledger-1.0.0';
export const TOTAL_EPSILON = 3;
export const EPS_RANGE = [0.1, 1];
export const DISTRICTS = ['North Hills', 'River Bend', 'Old Town', 'Rice Plain', 'East Ridge', 'Lake Side', 'Market', 'South Gate'];
export const BANDS = ['0', '1–2', '3–5', '6–10', '11+'];

// Public, fixed rules: allowed groupings and refusals do not depend on the data.
export const RULES = {
  allowed: { district: 'by district', band: 'by weekly-delivery band', 'district×band': 'by district and band' },
  refused: {
    village: 'Finer than district: refused by the public geography rule.',
    household: 'Household level: refused; the unit of release is a coarse group.',
    religion: 'Sensitive category: refused; it is not in the approved schema.',
    ethnicity: 'Sensitive category: refused; it is not in the approved schema.',
  },
};

export function population(seed, n = 5000) {
  if (!(Number.isInteger(n) && n >= 100 && n <= 50000)) throw new Error('Population must be 100–50000.');
  const rng = makeRng(deriveSeed(seed, 'pop'));
  const dw = DISTRICTS.map(() => rng.range(0.5, 1.5));
  const dsum = dw.reduce((a, b) => a + b, 0);
  const cells = new Array(DISTRICTS.length * BANDS.length).fill(0);
  const members = [];
  for (let i = 0; i < n; i++) {
    let u = rng.uniform() * dsum, d = 0;
    while (u > dw[d] && d < dw.length - 1) u -= dw[d++];
    const lam = 1.5 + d * 0.6;
    const k = rng.poisson(lam);
    const b = k === 0 ? 0 : k <= 2 ? 1 : k <= 5 ? 2 : k <= 10 ? 3 : 4;
    cells[d * BANDS.length + b]++;
    members.push(d * BANDS.length + b); // each fictional person sits in exactly one cell
  }
  return { n, cells, members, seed };
}

export function trueCounts(pop, groupBy) {
  if (groupBy === 'district') return DISTRICTS.map((label, d) => ({ label, count: BANDS.reduce((s, _, b) => s + pop.cells[d * BANDS.length + b], 0) }));
  if (groupBy === 'band') return BANDS.map((label, b) => ({ label, count: DISTRICTS.reduce((s, _, d) => s + pop.cells[d * BANDS.length + b], 0) }));
  if (groupBy === 'district×band') return pop.cells.map((count, i) => ({ label: `${DISTRICTS[Math.floor(i / BANDS.length)]} · ${BANDS[i % BANDS.length]}`, count }));
  throw new Error('Unknown grouping.');
}

export function canonical(q) {
  return JSON.stringify({ groupBy: String(q.groupBy), epsilon: Math.round(Number(q.epsilon) * 1000) / 1000, scope: q.scope });
}

export class Ledger {
  constructor(total = TOTAL_EPSILON, scope = 'scope-1') {
    this.total = total;
    this.spent = 0;
    this.reserved = 0;
    this.scope = scope;
    this.cache = new Map();
    this.pending = new Map();
    this.log = [];
  }
  remaining() {
    return this.total - this.spent - this.reserved;
  }
  // Atomic in this single-threaded page: check and reserve happen in one synchronous step.
  reserve(key, eps) {
    if (this.cache.has(key) || this.pending.has(key)) return { ok: true, duplicate: true };
    if (eps > this.remaining() + 1e-12) return { ok: false, reason: `Budget: this needs ε = ${eps}, only ${Math.max(0, this.remaining()).toFixed(2)} of ${this.total} is left.` };
    this.reserved += eps;
    this.pending.set(key, eps);
    return { ok: true, duplicate: false };
  }
  commit(key, release) {
    const eps = this.pending.get(key);
    this.pending.delete(key);
    this.reserved -= eps;
    this.spent += eps;
    this.cache.set(key, release);
    this.log.push({ key, eps, at: this.log.length + 1 });
  }
  abort(key) {
    const eps = this.pending.get(key);
    if (eps === undefined) return;
    this.pending.delete(key);
    this.reserved -= eps;
  }
}

// One release. Fails closed: unknown or refused groupings, bad ε, missing ledger.
export function release(pop, ledger, q, rngSeed) {
  if (!ledger) return { ok: false, reason: 'No ledger: refused.' };
  if (RULES.refused[q.groupBy]) return { ok: false, reason: RULES.refused[q.groupBy] };
  if (!RULES.allowed[q.groupBy]) return { ok: false, reason: 'Grouping not in the approved schema: refused.' };
  const eps = Number(q.epsilon);
  if (!(eps >= EPS_RANGE[0] && eps <= EPS_RANGE[1])) return { ok: false, reason: `ε must be between ${EPS_RANGE[0]} and ${EPS_RANGE[1]}.` };
  const key = canonical({ ...q, scope: ledger.scope });
  const r = ledger.reserve(key, eps);
  if (!r.ok) return { ok: false, reason: r.reason };
  if (r.duplicate) {
    const cached = ledger.cache.get(key);
    if (cached) return { ok: true, duplicate: true, release: cached };
    return { ok: false, reason: 'The same query is already in progress; its answer will be reused.' };
  }
  try {
    const rng = makeRng(deriveSeed(rngSeed, key));
    const b = 1 / eps; // L1 sensitivity 1 for a disjoint histogram, one row per person
    const half = Math.log(20) * b; // 95% interval of Laplace(0, b)
    const bins = trueCounts(pop, q.groupBy).map(({ label, count }) => {
      const noisy = count + rng.laplace(b);
      return { label, noisyCount: Math.max(0, Math.round(noisy * 10) / 10), interval95: Math.round(half * 10) / 10 };
    });
    const rel = { query: { groupBy: q.groupBy, epsilon: eps }, bins, mechanism: 'Laplace, b = 1/ε, negatives clamped to 0', budget: { total: ledger.total } };
    ledger.commit(key, rel);
    return { ok: true, duplicate: false, release: rel };
  } catch (e) {
    ledger.abort(key);
    return { ok: false, reason: 'Release failed and spent nothing: ' + e.message };
  }
}

// Output schema allowlist: only these keys may leave.
export function checkReleaseSchema(rel) {
  const top = new Set(['query', 'bins', 'mechanism', 'budget']);
  for (const k of Object.keys(rel)) if (!top.has(k)) return false;
  for (const b of rel.bins) for (const k of Object.keys(b)) if (!['label', 'noisyCount', 'interval95'].includes(k)) return false;
  return true;
}

export const jobs = {};
