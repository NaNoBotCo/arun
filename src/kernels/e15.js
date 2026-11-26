// E15 Earth Change Lens kernel: synthetic 64-D embeddings per fictional tile and year, cosine change score,
// PCA fit on reference tiles only, kNN over labelled reference patches. Pure functions, no DOM.
import { makeRng, deriveSeed } from '../core/rng.js';

export const DIM = 64;
export const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]; // fictional years
export const CLASSES = 6;
export const CLASS_NAMES = ['Class A', 'Class B', 'Class C', 'Class D', 'Class E', 'Class F'];
export const LIMITS = { K: [12, 32], noise: [0, 0.8], drift: [0, 1] };

function check(name, v, [lo, hi], integer = false) {
  if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
  if (integer && !Number.isInteger(v)) throw new Error(`${name} must be a whole number`);
}

export function validate(cfg) {
  check('K', cfg.K, LIMITS.K, true);
  check('noise', cfg.noise, LIMITS.noise);
  check('drift', cfg.drift, LIMITS.drift);
}

// Cosine similarity of two vectors; null when either has zero norm or a non-finite entry.
export function cosine(a, b) {
  if (a.length !== b.length) throw new Error('vectors must have the same length');
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!Number.isFinite(d) || !(na > 0) || !(nb > 0) || !Number.isFinite(na) || !Number.isFinite(nb)) return null;
  return Math.max(-1, Math.min(1, d / Math.sqrt(na * nb)));
}
export const changeScoreOf = (a, b) => {
  const c = cosine(a, b);
  return c === null ? null : 1 - c;
};

function cosineAt(emb, oa, ob) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < DIM; i++) {
    const x = emb[oa + i], y = emb[ob + i];
    d += x * y; na += x * x; nb += y * y;
  }
  if (!(na > 0) || !(nb > 0)) return null;
  return Math.max(-1, Math.min(1, d / Math.sqrt(na * nb)));
}

function normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

function randUnit(rng) {
  const v = new Float64Array(DIM);
  for (let i = 0; i < DIM; i++) v[i] = rng.normal();
  return normalize(v);
}

// Dataset: tiles on a K x K map, YEARS.length years. emb is Float32Array [T][Y][DIM]; a masked tile-year is the zero vector.
export function makeDataset(cfg, seed = 0, onProgress) {
  validate(cfg);
  const { K, noise, drift } = cfg;
  const T = K * K, Y = YEARS.length, C = CLASSES;
  const rP = makeRng(deriveSeed(seed, 'e15.protos'));
  const common = randUnit(rP);
  const protos = [];
  for (let c = 0; c < C; c++) {
    const u = randUnit(rP);
    const p = new Float64Array(DIM);
    for (let i = 0; i < DIM; i++) p[i] = Math.sqrt(0.4) * common[i] + Math.sqrt(0.6) * u[i];
    protos.push(normalize(p));
  }
  const rF = makeRng(deriveSeed(seed, 'e15.fields'));
  const fields = [];
  for (let c = 0; c < C; c++) {
    const terms = [];
    for (let m = 0; m < 3; m++) terms.push({ a: 0.6 + 0.4 * rF.uniform(), fx: rF.range(-2.5, 2.5), fy: rF.range(-2.5, 2.5), ph: rF.range(0, 2 * Math.PI) });
    fields.push(terms);
  }
  const base = new Float64Array(T * C);
  for (let t = 0; t < T; t++) {
    const x = (t % K) / K, y = Math.floor(t / K) / K;
    for (let c = 0; c < C; c++) {
      let s = 0;
      for (const m of fields[c]) s += m.a * Math.cos(2 * Math.PI * (m.fx * x + m.fy * y) + m.ph);
      base[t * C + c] = 3 * s;
    }
  }
  const argmax = (arr, o) => {
    let b = 0;
    for (let c = 1; c < C; c++) if (arr[o + c] > arr[o + b]) b = c;
    return b;
  };
  const rE = makeRng(deriveSeed(seed, 'e15.events'));
  const events = [];
  const nPerm = Math.max(2, Math.round(K / 4)), nTrans = Math.max(1, Math.round(K / 6));
  for (let i = 0; i < nPerm; i++) {
    const cx = rE.range(0, K), cy = rE.range(0, K);
    const t0 = Math.min(T - 1, Math.floor(cy) * K + Math.floor(cx));
    const from = argmax(base, t0 * C);
    let target = rE.int(C - 1);
    if (target >= from) target++;
    events.push({ kind: 'permanent', cx, cy, radius: rE.range(1.5, 3.5), year: 1 + rE.int(Y - 1), target });
  }
  for (let i = 0; i < nTrans; i++) {
    events.push({ kind: 'transient', cx: rE.range(0, K), cy: rE.range(0, K), radius: rE.range(1, 2.5), year: rE.int(Y), target: C - 1 });
  }
  const rD = makeRng(deriveSeed(seed, 'e15.drift'));
  const drifts = [];
  for (let y = 0; y < Y; y++) drifts.push(randUnit(rD));
  const rM = makeRng(deriveSeed(seed, 'e15.mask'));
  const rN = makeRng(deriveSeed(seed, 'e15.noise'));
  const emb = new Float32Array(T * Y * DIM);
  const cls = new Uint8Array(T * Y);
  const valid = new Uint8Array(T * Y);
  const sd = noise / Math.sqrt(DIM);
  const lg = new Float64Array(C), w = new Float64Array(C), v = new Float64Array(DIM);
  for (let t = 0; t < T; t++) {
    const tx = (t % K) + 0.5, ty = Math.floor(t / K) + 0.5;
    for (let y = 0; y < Y; y++) {
      for (let c = 0; c < C; c++) lg[c] = base[t * C + c];
      for (const e of events) {
        const inside = Math.hypot(tx - e.cx, ty - e.cy) < e.radius;
        if (inside && (e.kind === 'permanent' ? y >= e.year : y === e.year)) lg[e.target] += 12;
      }
      let mx = -Infinity;
      for (let c = 0; c < C; c++) mx = Math.max(mx, lg[c]);
      let z = 0;
      for (let c = 0; c < C; c++) { w[c] = Math.exp(lg[c] - mx); z += w[c]; }
      for (let c = 0; c < C; c++) w[c] /= z;
      cls[t * Y + y] = argmax(lg, 0);
      const missing = rM.uniform() < 0.02;
      const o = (t * Y + y) * DIM;
      if (missing) {
        for (let i = 0; i < DIM; i++) rN.normal(); // keep the noise stream aligned whatever the mask is
        continue;
      }
      valid[t * Y + y] = 1;
      for (let i = 0; i < DIM; i++) {
        let s = 0;
        for (let c = 0; c < C; c++) s += w[c] * protos[c][i];
        v[i] = s + sd * rN.normal() + drift * drifts[y][i];
      }
      normalize(v);
      for (let i = 0; i < DIM; i++) emb[o + i] = v[i];
    }
    if (onProgress && t % 32 === 0) onProgress(t / T);
  }
  onProgress && onProgress(1);
  return { K, T, Y, dim: DIM, years: YEARS, emb, cls, valid, events, noise, drift };
}

export function vecAt(ds, tile, year) {
  const o = (tile * ds.Y + year) * DIM;
  return ds.emb.subarray(o, o + DIM);
}

// Change score 1 - cos between year a and year b for every tile. valid[t] is 0 when either year is missing.
export function changeScores(ds, a, b) {
  const score = new Float64Array(ds.T), ok = new Uint8Array(ds.T);
  for (let t = 0; t < ds.T; t++) {
    const c = cosineAt(ds.emb, (t * ds.Y + a) * DIM, (t * ds.Y + b) * DIM);
    if (c !== null) { score[t] = 1 - c; ok[t] = 1; }
  }
  return { score, ok };
}

// Seeded truth: the dominant latent class differs between the two years.
export function truthChanged(ds, a, b) {
  const out = new Uint8Array(ds.T);
  for (let t = 0; t < ds.T; t++) out[t] = ds.cls[t * ds.Y + a] !== ds.cls[t * ds.Y + b] ? 1 : 0;
  return out;
}

export function detectionMetrics(score, ok, truth, thr) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let t = 0; t < score.length; t++) {
    if (!ok[t]) continue;
    const flag = score[t] > thr;
    if (flag && truth[t]) tp++;
    else if (flag) fp++;
    else if (truth[t]) fn++;
    else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  let f1 = null;
  if (precision !== null && recall !== null) f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const unchanged = fp + tn;
  return { tp, fp, fn, tn, precision, recall, f1, flagged: tp + fp, falseAlarmRate: unchanged > 0 ? fp / unchanged : null };
}

// Null distribution: scores of tiles whose latent class did not change. Gives a noise floor, z and an empirical p.
export function nullStats(score, ok, truth) {
  const vals = [];
  for (let t = 0; t < score.length; t++) if (ok[t] && !truth[t]) vals.push(score[t]);
  vals.sort((x, y) => x - y);
  const n = vals.length;
  if (n < 2) return { n, mean: null, sd: null, p95: null, z: () => null, p: () => null };
  let m = 0;
  for (const v of vals) m += v;
  m /= n;
  let s2 = 0;
  for (const v of vals) s2 += (v - m) ** 2;
  const sd = Math.sqrt(s2 / (n - 1));
  const p95 = vals[Math.min(n - 1, Math.floor(0.95 * (n - 1)))];
  const z = (s) => (sd > 0 ? (s - m) / sd : null);
  const p = (s) => {
    let c = 0;
    for (let i = n - 1; i >= 0 && vals[i] >= s; i--) c++;
    return (c + 1) / (n + 1);
  };
  return { n, mean: m, sd, p95, z, p };
}

// ---- PCA, fit on the vectors it is given (the caller passes reference tiles only) ----
export function covariance(vectors, mean) {
  const n = vectors.length, C = new Float64Array(DIM * DIM), x = new Float64Array(DIM);
  for (const v of vectors) {
    for (let i = 0; i < DIM; i++) x[i] = v[i] - mean[i];
    for (let i = 0; i < DIM; i++) {
      const xi = x[i];
      for (let j = i; j < DIM; j++) C[i * DIM + j] += xi * x[j];
    }
  }
  for (let i = 0; i < DIM; i++)
    for (let j = i; j < DIM; j++) {
      C[i * DIM + j] /= n - 1;
      C[j * DIM + i] = C[i * DIM + j];
    }
  return C;
}

export function pcaFit(vectors, k = 3, seed = 0) {
  const n = vectors.length;
  if (n < 3) throw new Error('PCA needs at least 3 reference tiles');
  const mean = new Float64Array(DIM);
  for (const v of vectors) for (let i = 0; i < DIM; i++) mean[i] += v[i] / n;
  const C = covariance(vectors, mean);
  let totalVar = 0;
  for (let i = 0; i < DIM; i++) totalVar += C[i * DIM + i];
  const rng = makeRng(deriveSeed(seed, 'e15.pca'));
  const comps = [], vals = [];
  const A = Float64Array.from(C);
  for (let c = 0; c < k; c++) {
    let v = randUnit(rng);
    let lambda = 0;
    for (let it = 0; it < 500; it++) {
      const w = new Float64Array(DIM);
      for (let i = 0; i < DIM; i++) {
        let s = 0;
        for (let j = 0; j < DIM; j++) s += A[i * DIM + j] * v[j];
        w[i] = s;
      }
      let nw = 0;
      for (let i = 0; i < DIM; i++) nw += w[i] * w[i];
      nw = Math.sqrt(nw);
      if (nw < 1e-300) break;
      for (let i = 0; i < DIM; i++) w[i] /= nw;
      let dot = 0;
      for (let i = 0; i < DIM; i++) dot += w[i] * v[i];
      v = w;
      lambda = nw;
      if (1 - Math.abs(dot) < 1e-13) break;
    }
    // fix the sign so the largest-magnitude entry is positive
    let big = 0;
    for (let i = 1; i < DIM; i++) if (Math.abs(v[i]) > Math.abs(v[big])) big = i;
    if (v[big] < 0) for (let i = 0; i < DIM; i++) v[i] = -v[i];
    comps.push(v);
    vals.push(lambda);
    for (let i = 0; i < DIM; i++) for (let j = 0; j < DIM; j++) A[i * DIM + j] -= lambda * v[i] * v[j];
  }
  return { kind: 'pca', mean, comps, vals, totalVar, n };
}

// Reference method for tests: full eigendecomposition of a symmetric matrix by cyclic Jacobi rotations.
export function jacobiEigen(M, n) {
  const A = Float64Array.from(M), V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i * n + j] ** 2;
    if (off < 1e-26) break;
    for (let p = 0; p < n - 1; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p], akq = A[k * n + q];
          A[k * n + p] = c * akp - s * akq;
          A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k], aqk = A[q * n + k];
          A[p * n + k] = c * apk - s * aqk;
          A[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p], vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq;
          V[k * n + q] = s * vkp + c * vkq;
        }
      }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[b * n + b] - A[a * n + a]);
  return {
    vals: order.map((i) => A[i * n + i]),
    vecs: order.map((i) => Float64Array.from({ length: n }, (_, k) => V[k * n + i])),
  };
}

// Seeded random orthonormal axes, centred on the reference mean: the comparison projection.
export function randomProjection(vectors, k = 3, seed = 0) {
  const mean = new Float64Array(DIM);
  for (const v of vectors) for (let i = 0; i < DIM; i++) mean[i] += v[i] / vectors.length;
  const rng = makeRng(deriveSeed(seed, 'e15.randproj'));
  const comps = [];
  for (let c = 0; c < k; c++) {
    const v = randUnit(rng);
    for (const u of comps) {
      let d = 0;
      for (let i = 0; i < DIM; i++) d += v[i] * u[i];
      for (let i = 0; i < DIM; i++) v[i] -= d * u[i];
    }
    comps.push(normalize(v));
  }
  return { kind: 'random', mean, comps, vals: null, totalVar: null, n: vectors.length };
}

export function project(model, vec) {
  const out = new Float64Array(model.comps.length);
  for (let c = 0; c < out.length; c++) {
    let s = 0;
    for (let i = 0; i < DIM; i++) s += model.comps[c][i] * (vec[i] - model.mean[i]);
    out[c] = s;
  }
  return out;
}

// Seeded reference patches: a fixed permutation of tiles, so a larger R only adds tiles. Taps are added after.
export function referenceTiles(ds, R, seed, year, extras = []) {
  check('R', R, [3, ds.T], true);
  const rng = makeRng(deriveSeed(seed, 'e15.ref'));
  const perm = Array.from({ length: ds.T }, (_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const out = [];
  const seen = new Set();
  for (const t of perm) {
    if (out.length >= R) break;
    if (ds.valid[t * ds.Y + year]) { out.push(t); seen.add(t); }
  }
  for (const t of extras) if (t >= 0 && t < ds.T && !seen.has(t) && ds.valid[t * ds.Y + year]) { out.push(t); seen.add(t); }
  return out;
}

// kNN by cosine from tile@year to the labelled reference patches (their year-a embedding, their latent class as label).
export function knn(ds, tile, year, refTiles, refYear, k) {
  check('k', k, [1, 50], true);
  const q = vecAt(ds, tile, year);
  const cand = [];
  for (const r of refTiles) {
    if (r === tile && refYear === year) continue;
    const c = cosine(q, vecAt(ds, r, refYear));
    if (c !== null) cand.push({ tile: r, sim: c, label: ds.cls[r * ds.Y + refYear] });
  }
  cand.sort((x, y) => y.sim - x.sim || x.tile - y.tile);
  const nb = cand.slice(0, k);
  if (!nb.length) return { neighbours: [], predicted: null, voteShare: null, entropy: null };
  const votes = new Array(CLASSES).fill(0);
  for (const n of nb) votes[n.label]++;
  let best = 0;
  for (let c = 1; c < CLASSES; c++) if (votes[c] > votes[best]) best = c;
  let H = 0;
  for (const v of votes) if (v > 0) H -= (v / nb.length) * Math.log2(v / nb.length);
  return { neighbours: nb, predicted: best, voteShare: votes[best] / nb.length, entropy: H, votes };
}

export function cosineByYear(ds, tile, a) {
  const out = [];
  for (let y = 0; y < ds.Y; y++) out.push(cosineAt(ds.emb, (tile * ds.Y + a) * DIM, (tile * ds.Y + y) * DIM));
  return out;
}

function median(arr) {
  if (!arr.length) return null;
  const s = Float64Array.from(arr).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

// Everything the exhibit shows for one setting. Cheap (a few ms for 576 tiles).
export function analyze(ds, p) {
  const { a, b, thr, R, k, projection = 'pca12', extras = [], seed = 0 } = p;
  check('year a', a, [0, ds.Y - 1], true);
  check('year b', b, [0, ds.Y - 1], true);
  check('threshold', thr, [0, 2]);
  const refs = referenceTiles(ds, R, seed, a, extras);
  const refVecs = refs.map((t) => vecAt(ds, t, a));
  const model = projection === 'random' ? randomProjection(refVecs, 3, seed) : pcaFit(refVecs, 3, seed);
  const { score, ok } = changeScores(ds, a, b);
  const truth = truthChanged(ds, a, b);
  const metrics = detectionMetrics(score, ok, truth, thr);
  const nul = nullStats(score, ok, truth);
  const coords = new Float64Array(ds.T * 3);
  for (let t = 0; t < ds.T; t++) {
    if (!ds.valid[t * ds.Y + b]) continue;
    coords.set(project(model, vecAt(ds, t, b)), t * 3);
  }
  const refCoords = refs.map((t) => project(model, vecAt(ds, t, a)));
  // variance share along the three axes: reference tiles vs tiles that were not used in the fit (same year)
  const isRef = new Set(refs);
  const share = (tiles) => {
    let along = 0, tot = 0;
    for (const t of tiles) {
      const v = vecAt(ds, t, a), pr = project(model, v);
      for (let c = 0; c < pr.length; c++) along += pr[c] * pr[c];
      for (let i = 0; i < DIM; i++) tot += (v[i] - model.mean[i]) ** 2;
    }
    return tot > 0 ? along / tot : null;
  };
  const heldTiles = [];
  for (let t = 0; t < ds.T; t++) if (!isRef.has(t) && ds.valid[t * ds.Y + a]) heldTiles.push(t);
  const medianCos = [];
  for (let y = 0; y < ds.Y; y++) {
    const cs = [];
    for (let t = 0; t < ds.T; t++) {
      const c = cosineAt(ds.emb, (t * ds.Y + a) * DIM, (t * ds.Y + y) * DIM);
      if (c !== null) cs.push(c);
    }
    medianCos.push(median(cs));
  }
  let masked = 0;
  for (let i = 0; i < ds.valid.length; i++) if (!ds.valid[i]) masked++;
  return {
    refs, model, score, ok, truth, metrics, nul, coords, refCoords, medianCos, masked,
    shareRef: share(refs), shareHeld: share(heldTiles), nHeld: heldTiles.length,
    explained: model.vals ? model.vals.map((v) => v / model.totalVar) : null,
    medianScore: median(Array.from(score).filter((_, t) => ok[t])),
  };
}

// Job: F1 and false alarms against embedding noise, over repeated seeds, with and without the annual drift.
export function noiseSweep(payload, progress) {
  const { K = 16, a = 0, b = 7, thr = 0.2, drift = 0.1, seed = 0, nSeeds = 6, levels = [0, 0.1, 0.2, 0.3, 0.4, 0.5] } = payload;
  const kk = Math.max(12, Math.min(K, 20));
  const total = levels.length * nSeeds * 2;
  let done = 0;
  const series = { drift0: { f1: [], fpr: [] }, driftNow: { f1: [], fpr: [] } };
  for (const level of levels) {
    for (const [name, dr] of [['drift0', 0], ['driftNow', drift]]) {
      let f1s = 0, fprs = 0, nf = 0, nr = 0;
      for (let s = 0; s < nSeeds; s++) {
        const ds = makeDataset({ K: kk, noise: level, drift: dr }, deriveSeed(seed, 'sweep' + s));
        const { score, ok } = changeScores(ds, a, b);
        const m = detectionMetrics(score, ok, truthChanged(ds, a, b), thr);
        if (m.f1 !== null) { f1s += m.f1; nf++; }
        if (m.falseAlarmRate !== null) { fprs += m.falseAlarmRate; nr++; }
        done++;
        progress && progress(done / total);
      }
      series[name].f1.push(nf ? f1s / nf : null);
      series[name].fpr.push(nr ? fprs / nr : null);
    }
  }
  return { levels, nSeeds, K: kk, ...series };
}

export const jobs = {
  // The embeddings travel as an ArrayBuffer: the job runner measures result size with JSON.stringify, which is slow on a big typed array.
  'e15.build': (payload, { progress } = {}) => {
    const ds = makeDataset(payload.cfg, payload.seed, progress);
    const { emb, ...rest } = ds;
    return { ...rest, embBuffer: emb.buffer };
  },
  'e15.noiseSweep': (payload, { progress } = {}) => noiseSweep(payload, progress),
};

export function datasetFromJob(r) {
  return { ...r, emb: new Float32Array(r.embBuffer) };
}
