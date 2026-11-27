// Two shores: a reciprocity experiment between two simulated rain labs, Chiang Mai and Phnom Penh.
// Each lab has its own synthetic rain events and its own street-camera bias against a reference gauge.
// Task on each side: turn camera readings into gauge rain. Scored on that side's withheld cases.
// Pure functions, no DOM, deterministic from a seed. Nothing here is a measurement.
import { mulberry32, normal, hash32 } from './rng.js';

export const SIDES = ['cm', 'pp'];
export const HEAVY = 25;          // mm/h
export const TEST_N = 300;        // withheld cases per side per replicate
export const MAX_TRAIN = 150;
export const MIN_TRAIN = 8;
export const ARMS = ['method', 'params', 'pooled', 'pooledSide'];

// Climate: how rain looks on each side. Camera: how the street camera reads it.
// reading = m * gauge^s * (night ? nf : 1) * exp(sd * z) + floor noise
const LAB = {
  cm: { mu: 1.9, sg: 0.85, night: 0.30, cam: { lm: Math.log(1.15), s: 0.95, lnf: Math.log(0.70), sd: 0.25 }, proc: 'logNight' },
  pp: { mu: 2.2, sg: 1.0, night: 0.45, cam: { lm: Math.log(0.80), s: 1.10, lnf: Math.log(0.45), sd: 0.40 }, proc: 'scale' },
};
export const PROCEDURES = {
  scale: { terms: 1 },       // rain = k x camera
  logNight: { terms: 3 },    // ln(1 + rain) = a + b ln(1 + camera) + d night, retransformed with a smearing factor
};
export const DEFAULTS = {
  seed: 7, replicates: 40, gap: 1,
  cm: { n: 80, shareObs: true, shareMethod: true, shareParams: true },
  pp: { n: 24, shareObs: true, shareMethod: true, shareParams: true },
};

const other = s => (s === 'cm' ? 'pp' : 'cm');

// ---------- settings ----------
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export function normalizeSettings(partial = {}) {
  if (partial === null || typeof partial !== 'object') throw new TypeError('settings must be an object');
  const s = { seed: DEFAULTS.seed, replicates: DEFAULTS.replicates, gap: DEFAULTS.gap, cm: { ...DEFAULTS.cm }, pp: { ...DEFAULTS.pp } };
  for (const k of Object.keys(partial)) {
    if (k === 'cm' || k === 'pp') {
      const v = partial[k];
      if (v === null || typeof v !== 'object') throw new TypeError(`${k} must be an object`);
      for (const f of Object.keys(v)) {
        if (!(f in DEFAULTS[k])) throw new RangeError(`unknown setting ${k}.${f}`);
        s[k][f] = v[f];
      }
    } else if (k in s) s[k] = partial[k];
    else throw new RangeError(`unknown setting ${k}`);
  }
  if (!isInt(s.seed, 0, 2 ** 31)) throw new RangeError('seed must be an integer from 0 to 2^31');
  if (!isInt(s.replicates, 1, 300)) throw new RangeError('replicates must be an integer from 1 to 300');
  if (typeof s.gap !== 'number' || !Number.isFinite(s.gap) || s.gap < 0 || s.gap > 2) throw new RangeError('gap must be a number from 0 to 2');
  for (const side of SIDES) {
    if (!isInt(s[side].n, MIN_TRAIN, MAX_TRAIN)) throw new RangeError(`${side}.n must be an integer from ${MIN_TRAIN} to ${MAX_TRAIN}`);
    for (const f of ['shareObs', 'shareMethod', 'shareParams']) if (typeof s[side][f] !== 'boolean') throw new TypeError(`${side}.${f} must be true or false`);
  }
  return s;
}

// ---------- synthetic events ----------
// The Phnom Penh camera sits at the Chiang Mai camera plus gap x (the difference). gap 0: same camera on both sides.
function camera(side, gap) {
  const a = LAB.cm.cam, b = LAB.pp.cam;
  if (side === 'cm') return a;
  const lerp = (x, y) => x + gap * (y - x);
  return { lm: lerp(a.lm, b.lm), s: lerp(a.s, b.s), lnf: lerp(a.lnf, b.lnf), sd: lerp(a.sd, b.sd) };
}

// A case: { g: gauge mm/h, c: camera mm/h, night: 0|1 }. Stream per (seed, replicate, side, role), so a longer
// training run extends a shorter one and the withheld cases do not depend on how many training cases there are.
export function genCases(side, gap, seed, rep, role, n) {
  const L = LAB[side], cam = camera(side, gap);
  const rand = mulberry32(hash32(`${seed}|${rep}|${side}|${role}`));
  const rows = [];
  for (let i = 0; i < n; i++) {
    const night = rand() < L.night ? 1 : 0;
    const g = Math.min(200, Math.exp(L.mu + L.sg * normal(rand)));
    const c = Math.max(0, Math.exp(cam.lm + cam.s * Math.log(g) + (night ? cam.lnf : 0) + cam.sd * normal(rand)) + 0.25 * normal(rand));
    rows.push({ g, c, night });
  }
  return rows;
}

export function makeReplicate(settings, rep) {
  const s = normalizeSettings(settings), out = {};
  for (const side of SIDES) {
    out[side] = {
      train: genCases(side, s.gap, s.seed, rep, 'train', s[side].n),
      test: genCases(side, s.gap, s.seed, rep, 'test', TEST_N),
    };
  }
  return out;
}

// ---------- fitting: training rows only ----------
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < n; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let v = M[i][n]; for (let c = i + 1; c < n; c++) v -= M[i][c] * x[c]; x[i] = v / M[i][i]; }
  return x;
}

// rows: [{g,c,night, side?}]. side: label of each row's origin, used by the indicator. indicator: 1 for rows of `ind`.
export function fit(proc, rows, opts = {}) {
  if (!PROCEDURES[proc]) throw new RangeError('unknown procedure ' + proc);
  if (!Array.isArray(rows) || rows.length < 3) throw new RangeError('fit needs at least 3 cases');
  for (const r of rows) if (!(Number.isFinite(r.g) && Number.isFinite(r.c) && (r.night === 0 || r.night === 1))) throw new TypeError('case needs finite g, c and night 0 or 1');
  if (proc === 'scale') {
    let cg = 0, cc = 0; for (const r of rows) { cg += r.c * r.g; cc += r.c * r.c; }
    return { proc, coef: { k: cc > 0 ? cg / cc : 1 } };
  }
  const ind = opts.indicator || null;    // { side } adds an intercept shift for rows from that side
  const X = rows.map(r => [1, Math.log1p(r.c), r.night, ...(ind ? [r.side === ind.side ? 1 : 0] : [])]);
  const y = rows.map(r => Math.log1p(r.g)), p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
  for (let i = 0; i < rows.length; i++) for (let a = 0; a < p; a++) { b[a] += X[i][a] * y[i]; for (let c = 0; c < p; c++) A[a][c] += X[i][a] * X[i][c]; }
  for (let a = 1; a < p; a++) A[a][a] += 1e-3;       // a whisper of ridge keeps a night-free sample solvable
  const beta = solve(A, b);
  let sm = 0; for (let i = 0; i < rows.length; i++) { let e = 0; for (let a = 0; a < p; a++) e += beta[a] * X[i][a]; sm += Math.exp(y[i] - e); }
  const smear = sm / rows.length;
  return { proc, coef: { a: beta[0], b: beta[1], d: beta[2], side: ind ? beta[3] : 0, smear }, indicator: ind ? ind.side : null };
}

export function predict(model, row, side = null) {
  const m = model.coef;
  if (model.proc === 'scale') return Math.max(0, m.k * row.c);
  const eta = m.a + m.b * Math.log1p(row.c) + m.d * row.night + (model.indicator && model.indicator === side ? m.side : 0);
  return Math.max(0, Math.exp(eta) * m.smear - 1);
}

// ---------- scoring: withheld rows only ----------
export function score(model, test, side = null) {
  let ae = 0, heavy = 0, hit = 0, fa = 0;
  for (const r of test) {
    const q = predict(model, r, side);
    ae += Math.abs(q - r.g);
    if (r.g >= HEAVY) { heavy++; if (q >= HEAVY) hit++; } else if (q >= HEAVY) fa++;
  }
  return { mae: ae / test.length, heavy, hit, falseAlarm: fa, hitRate: heavy ? hit / heavy : NaN, n: test.length };
}

// ---------- availability and provenance ----------
export function availability(settings) {
  const s = normalizeSettings(settings), out = {};
  for (const side of SIDES) {
    const o = other(side), a = { method: null, params: null, pooled: null, pooledSide: null };
    if (!s[o].shareMethod) a.method = { needs: o, what: 'method' };
    if (!s[o].shareParams) a.params = { needs: o, what: 'params' };
    const poolNeed = SIDES.filter(x => !s[x].shareObs);
    if (poolNeed.length) { a.pooled = { needs: poolNeed, what: 'obs' }; a.pooledSide = a.pooled; }
    out[side] = a;    // null = available; otherwise what is missing and from whom
  }
  return out;
}

// Where each model's training records come from: [{ side, n }], plus the procedure's origin.
export function provenance(settings, side) {
  const s = normalizeSettings(settings), o = other(side);
  return {
    local: { procFrom: side, records: [{ side, n: s[side].n }] },
    method: { procFrom: o, records: [{ side, n: s[side].n }] },
    params: { procFrom: o, records: [{ side: o, n: s[o].n }] },
    pooled: { procFrom: 'pooled', records: [{ side, n: s[side].n }, { side: o, n: s[o].n }] },
    pooledSide: { procFrom: 'pooled', records: [{ side, n: s[side].n }, { side: o, n: s[o].n }] },
  };
}

// All models for one replicate. Uses training rows only. Unavailable arms are null.
export function fitArms(rep, settings) {
  const s = normalizeSettings(settings), av = availability(s), out = {};
  const tag = side => rep[side].train.map(r => ({ ...r, side }));
  for (const side of SIDES) {
    const o = other(side), own = rep[side].train, oth = rep[o].train;
    const m = { local: fit(LAB[side].proc, own) };
    m.method = av[side].method ? null : fit(LAB[o].proc, own);
    m.params = av[side].params ? null : fit(LAB[o].proc, oth);
    const pool = [...tag(side), ...tag(o)];
    m.pooled = av[side].pooled ? null : fit('logNight', pool);
    m.pooledSide = av[side].pooledSide ? null : fit('logNight', pool, { indicator: { side } });
    out[side] = m;
  }
  return out;
}

export function scoreArms(models, rep) {
  const out = {};
  for (const side of SIDES) {
    out[side] = {};
    for (const [arm, mod] of Object.entries(models[side])) out[side][arm] = mod ? score(mod, rep[side].test, side) : null;
  }
  return out;
}

// ---------- replicates ----------
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const summarize = xs => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return { median: quantile(v, 0.5), p10: quantile(v, 0.1), p90: quantile(v, 0.9), n: v.length };
};

// Benefit = local-only error minus arm error (mm/h). Positive: the arm is better than local-only.
// hitGain: arm hit rate minus local hit rate (share of heavy-rain cases caught, in points of 1).
export function run(settings) {
  const s = normalizeSettings(settings), av = availability(s), prov = {};
  for (const side of SIDES) prov[side] = provenance(s, side);
  const acc = {}; for (const side of SIDES) { acc[side] = { local: { mae: [], hitRate: [], falseAlarm: [] } }; for (const a of ARMS) acc[side][a] = { mae: [], benefit: [], hitRate: [], hitGain: [], falseAlarm: [] }; }
  for (let r = 0; r < s.replicates; r++) {
    const rep = makeReplicate(s, r), sc = scoreArms(fitArms(rep, s), rep);
    for (const side of SIDES) {
      const L = sc[side].local;
      acc[side].local.mae.push(L.mae); acc[side].local.hitRate.push(L.hitRate); acc[side].local.falseAlarm.push(L.falseAlarm);
      for (const a of ARMS) {
        const q = sc[side][a]; if (!q) continue;
        acc[side][a].mae.push(q.mae); acc[side][a].benefit.push(L.mae - q.mae);
        acc[side][a].hitRate.push(q.hitRate); acc[side][a].hitGain.push(q.hitRate - L.hitRate); acc[side][a].falseAlarm.push(q.falseAlarm);
      }
    }
  }
  const sides = {};
  for (const side of SIDES) {
    const A = acc[side], res = { n: s[side].n, procedure: LAB[side].proc, local: { mae: summarize(A.local.mae), hitRate: summarize(A.local.hitRate), falseAlarm: summarize(A.local.falseAlarm), provenance: prov[side].local }, arms: {} };
    for (const a of ARMS) {
      if (av[side][a]) { res.arms[a] = { available: false, missing: av[side][a], provenance: prov[side][a] }; continue; }
      const b = summarize(A[a].benefit);
      const neg = A[a].benefit.filter(x => x < 0).length;
      res.arms[a] = {
        available: true, mae: summarize(A[a].mae), benefit: b, hitGain: summarize(A[a].hitGain), hitRate: summarize(A[a].hitRate),
        falseAlarm: summarize(A[a].falseAlarm), worseShare: neg / A[a].benefit.length, negative: b.median < 0, provenance: prov[side][a],
      };
    }
    sides[side] = res;
  }
  return { settings: s, replicates: s.replicates, testN: TEST_N, heavy: HEAVY, sides };
}
