// E13 The Invisible Landscape: seeded truth, sparse noisy samples, three reconstructions, held-out error. Pure functions.
import { makeRng, deriveSeed } from '../core/rng.js';
import { choleskyFactor, choleskySolve } from '../core/stats.js';

export const DOMAIN_KM = 10;
export const PRIOR = { mean_m: 20, sd_m: 4 }; // documented prior: depth 20 m, sd 4 m, used by the Gaussian process and when there is no data
export const LIMITS = { n: [0, 150], noise_sd_m: [0, 3], ell_km: [0.2, 6], reg: [-8, 0], idw_power: [1, 6], roughness: [0.5, 3], G: [16, 64] };
export const METHODS = ['idw', 'gp', 'rbf'];
export const PLACEMENTS = ['random', 'grid', 'clustered', 'adaptive', 'manual'];
export const N_TEST = 300;

function check(name, v, [lo, hi], integer = false) {
  if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
  if (integer && !Number.isInteger(v)) throw new Error(`${name} must be a whole number`);
}
export function validate(c) {
  if (!METHODS.includes(c.method)) throw new Error('method must be idw, gp or rbf');
  if (!PLACEMENTS.includes(c.placement)) throw new Error('placement must be one of ' + PLACEMENTS.join(', '));
  check('n', c.n, LIMITS.n, true);
  check('noise_sd_m', c.noise_sd_m, LIMITS.noise_sd_m);
  check('ell_km', c.ell_km, LIMITS.ell_km);
  check('reg', c.reg, LIMITS.reg);
  check('idw_power', c.idw_power, LIMITS.idw_power);
  check('roughness', c.roughness, LIMITS.roughness);
  check('G', c.G, LIMITS.G, true);
}

// ---- truth: a trend plus ten Gaussian bumps, depth_m of a fictional buried layer ----
export function makeTruth(seed, roughness, kind = 'terrain') {
  if (kind === 'constant') return { kind, at: () => PRIOR.mean_m };
  const rng = makeRng(deriveSeed(seed, 'e13.truth'));
  const tx = rng.normal() * 0.35, ty = rng.normal() * 0.35;
  const bumps = [];
  for (let b = 0; b < 10; b++) bumps.push({ cx: rng.range(0, DOMAIN_KM), cy: rng.range(0, DOMAIN_KM), w: roughness * rng.range(0.5, 1.2), h: rng.normal() * 3.4 });
  return {
    kind, bumps,
    at(x, y) {
      let v = PRIOR.mean_m + tx * (x - 5) + ty * (y - 5);
      for (const b of bumps) v += b.h * Math.exp(-((x - b.cx) ** 2 + (y - b.cy) ** 2) / (2 * b.w * b.w));
      return v;
    },
  };
}

export function cellCentre(i, G) {
  return ((i + 0.5) / G) * DOMAIN_KM;
}

// ---- sample positions ----
export function randomSequence(seed, n) {
  const rng = makeRng(deriveSeed(seed, 'e13.samples'));
  const out = [];
  for (let i = 0; i < n; i++) out.push([rng.range(0, DOMAIN_KM), rng.range(0, DOMAIN_KM)]);
  return out;
}
function gridSamples(seed, n) {
  const rng = makeRng(deriveSeed(seed, 'e13.grid'));
  const m = Math.max(1, Math.ceil(Math.sqrt(n)));
  const cell = DOMAIN_KM / m;
  const all = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) all.push([(i + 0.5) * cell + rng.range(-0.15, 0.15) * cell, (j + 0.5) * cell + rng.range(-0.15, 0.15) * cell]);
  for (let i = all.length - 1; i > 0; i--) { const k = rng.int(i + 1); [all[i], all[k]] = [all[k], all[i]]; }
  return all.slice(0, n);
}
function clusteredSamples(seed, n) {
  const rng = makeRng(deriveSeed(seed, 'e13.cluster'));
  const cx = rng.range(2, 4), cy = rng.range(2, 4);
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = 1.6 * Math.sqrt(rng.uniform()), a = rng.range(0, 2 * Math.PI);
    out.push([Math.min(DOMAIN_KM, Math.max(0, cx + r * Math.cos(a))), Math.min(DOMAIN_KM, Math.max(0, cy + r * Math.sin(a)))]);
  }
  return out;
}

// ---- Gaussian process: squared-exponential covariance s0^2 exp(-d^2 / 2 l^2), noise variance sigma^2 ----
function fwd(L, n, b) {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  return y;
}

export function gpFit(X, y, { ell_km, noise_sd_m, prior = PRIOR }) {
  const n = X.length;
  const s2 = prior.sd_m * prior.sd_m, inv = -1 / (2 * ell_km * ell_km);
  const nug = noise_sd_m * noise_sd_m + 1e-6 * s2;
  const K = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      const d2 = (X[i][0] - X[j][0]) ** 2 + (X[i][1] - X[j][1]) ** 2;
      const v = s2 * Math.exp(d2 * inv) + (i === j ? nug : 0);
      K[i * n + j] = v; K[j * n + i] = v;
    }
  const L = choleskyFactor(K, n);
  if (!L) return { ok: false, reason: 'The covariance matrix is not positive definite: samples sit too close for this length scale and noise. Raise the noise or shorten the length scale.' };
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = y[i] - prior.mean_m;
  const z = fwd(L, n, r);
  return { ok: true, L, z, n, X, s2, inv, prior, nug };
}

export function gpPredict(m, qx, qy, wantVar = true) {
  const { L, z, n, X, s2, inv, prior } = m;
  const k = new Float64Array(n);
  let mean = prior.mean_m, v2 = s2;
  if (n > 0) {
    for (let i = 0; i < n; i++) k[i] = s2 * Math.exp(((X[i][0] - qx) ** 2 + (X[i][1] - qy) ** 2) * inv);
    const v = fwd(L, n, k);
    let sm = 0, sv = 0;
    for (let i = 0; i < n; i++) { sm += v[i] * z[i]; sv += v[i] * v[i]; }
    mean += sm;
    v2 = s2 - sv;
  }
  return { mean, var: wantVar ? Math.max(0, v2) : undefined };
}

// Leave-one-out predictions from the closed form: residual_i = alpha_i / Kinv_ii, variance = 1 / Kinv_ii.
export function gpLoo(m, y) {
  const { L, n, prior } = m;
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = y[i] - prior.mean_m;
  const alpha = choleskySolve(L, n, r);
  const e = new Float64Array(n);
  let se = 0, inCov = 0;
  const zs = [];
  for (let i = 0; i < n; i++) {
    e.fill(0); e[i] = 1;
    const col = choleskySolve(L, n, e);
    const kii = col[i];
    const res = alpha[i] / kii;
    se += res * res;
    const z = alpha[i] / Math.sqrt(kii);
    zs.push(z);
    if (Math.abs(z) < 1.959964) inCov++;
  }
  return { rmse: Math.sqrt(se / n), coverage95: inCov / n, z: zs };
}

// ---- predictors that see training data only ----
export function buildPredictor(method, X, y, cfg) {
  const n = X.length;
  const prior = PRIOR;
  if (n === 0) return { ok: true, predict: () => ({ mean: prior.mean_m, var: method === 'gp' ? prior.sd_m ** 2 : undefined }) };
  if (method === 'idw') {
    const p = cfg.idw_power;
    return {
      ok: true,
      predict(qx, qy) {
        let sw = 0, sv = 0;
        for (let i = 0; i < n; i++) {
          const d2 = (X[i][0] - qx) ** 2 + (X[i][1] - qy) ** 2;
          if (d2 < 1e-18) return { mean: y[i] };
          const w = Math.pow(d2, -p / 2);
          sw += w; sv += w * y[i];
        }
        return { mean: sv / sw };
      },
    };
  }
  if (method === 'gp') {
    const m = gpFit(X, y, cfg);
    if (!m.ok) return m;
    return { ok: true, model: m, predict: (qx, qy) => gpPredict(m, qx, qy) };
  }
  // regularised RBF: Gaussian basis of width l, ridge lambda = 10^reg, intercept = mean of the data
  const lam = Math.pow(10, cfg.reg), inv = -1 / (2 * cfg.ell_km * cfg.ell_km);
  let b0 = 0;
  for (let i = 0; i < n; i++) b0 += y[i];
  b0 /= n;
  const A = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      const v = Math.exp(((X[i][0] - X[j][0]) ** 2 + (X[i][1] - X[j][1]) ** 2) * inv) + (i === j ? lam : 0);
      A[i * n + j] = v; A[j * n + i] = v;
    }
  const L = choleskyFactor(A, n);
  if (!L) return { ok: false, reason: 'The RBF matrix is not positive definite at this ridge. Raise the regularisation.' };
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = y[i] - b0;
  const c = choleskySolve(L, n, r);
  return {
    ok: true,
    predict(qx, qy) {
      let s = b0;
      for (let i = 0; i < n; i++) s += c[i] * Math.exp(((X[i][0] - qx) ** 2 + (X[i][1] - qy) ** 2) * inv);
      return { mean: s };
    },
  };
}

export function kFoldRmse(method, X, y, cfg, seed, K = 5) {
  const n = X.length;
  if (n < 2 * K) return null;
  const rng = makeRng(deriveSeed(seed, 'e13.folds'));
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const k = rng.int(i + 1); [perm[i], perm[k]] = [perm[k], perm[i]]; }
  let se = 0;
  for (let f = 0; f < K; f++) {
    const te = perm.filter((_, i) => i % K === f), tr = perm.filter((_, i) => i % K !== f);
    const p = buildPredictor(method, tr.map((i) => X[i]), tr.map((i) => y[i]), cfg);
    if (!p.ok) return null;
    for (const i of te) se += (p.predict(X[i][0], X[i][1]).mean - y[i]) ** 2;
  }
  return Math.sqrt(se / n);
}

// Adaptive positions: start from `start` random points, then each new point goes where the posterior variance is largest.
export function adaptiveSequence(seed, n, cfg, cand = 20, start = 4) {
  const pts = randomSequence(seed, Math.min(n, start));
  const cc = [];
  for (let j = 0; j < cand; j++) for (let i = 0; i < cand; i++) cc.push([cellCentre(i, cand), cellCentre(j, cand)]);
  while (pts.length < n) {
    const m = gpFit(pts, new Float64Array(pts.length), cfg);
    if (!m.ok) break;
    let best = -1, bv = -1;
    for (let c = 0; c < cc.length; c++) {
      const v = gpPredict(m, cc[c][0], cc[c][1]).var;
      if (v > bv) { bv = v; best = c; }
    }
    pts.push(cc[best]);
  }
  return pts;
}

export function samplePositions(cfg, seed, manual) {
  if (cfg.placement === 'manual') return (manual || []).slice(0, cfg.n);
  if (cfg.placement === 'random') return randomSequence(seed, cfg.n);
  if (cfg.placement === 'grid') return gridSamples(seed, cfg.n);
  if (cfg.placement === 'clustered') return clusteredSamples(seed, cfg.n);
  return adaptiveSequence(seed, cfg.n, cfg);
}

function noiseDraws(seed, n) {
  const rng = makeRng(deriveSeed(seed, 'e13.noise'));
  const z = [];
  for (let i = 0; i < n; i++) z.push(rng.normal());
  return z;
}

export function testPoints(seed, m = N_TEST) {
  const rng = makeRng(deriveSeed(seed, 'e13.test'));
  const out = [];
  for (let i = 0; i < m; i++) out.push([rng.range(0, DOMAIN_KM), rng.range(0, DOMAIN_KM)]);
  return out;
}

const ELLS = [0.3, 0.45, 0.65, 0.9, 1.2, 1.6, 2.2, 3, 4, 6];

// One full run: truth -> samples -> fit (training data only) -> predictions -> scores.
// `truth` can be replaced (the leakage test passes one that answers NaN at test points).
export function runFit(cfgIn, seed, manual = null, truth = null) {
  const cfg = { G: 40, ...cfgIn };
  validate(cfg);
  const G = cfg.G;
  const T = truth || makeTruth(seed, cfg.roughness, cfg.constantTruth ? 'constant' : 'terrain');
  const pos = samplePositions(cfg, seed, manual);
  const z = noiseDraws(seed, pos.length);
  const y = new Float64Array(pos.length);
  for (let i = 0; i < pos.length; i++) y[i] = T.at(pos[i][0], pos[i][1]) + cfg.noise_sd_m * z[i];
  const out = { ok: true, reason: '', G, cfg, samples: pos.map((p, i) => [p[0], p[1], y[i]]), n: pos.length };
  const pred = buildPredictor(cfg.method, pos, y, cfg);
  if (!pred.ok) return { ...out, ok: false, reason: pred.reason };
  const truthG = new Float64Array(G * G), mean = new Float64Array(G * G), err = new Float64Array(G * G);
  const sd = cfg.method === 'gp' ? new Float64Array(G * G) : null;
  let se = 0;
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      const x = cellCentre(i, G), yy = cellCentre(j, G), k = j * G + i;
      const p = pred.predict(x, yy);
      mean[k] = p.mean;
      truthG[k] = T.at(x, yy);
      err[k] = p.mean - truthG[k];
      se += err[k] * err[k];
      if (sd) sd[k] = Math.sqrt(p.var);
    }
  for (const a of [mean, sd]) if (a) for (let k = 0; k < a.length; k++) if (!Number.isFinite(a[k])) return { ...out, ok: false, reason: 'A prediction is not finite.' };
  // held-out points: a separate stream, never used to fit
  const tp = testPoints(seed);
  let te = 0, ta = 0, tb = 0, tp0 = 0, cov = 0, nov = 0;
  for (const [x, yy] of tp) {
    const p = pred.predict(x, yy), tv = T.at(x, yy), e = p.mean - tv;
    te += e * e; ta += Math.abs(e); tb += e; tp0 += (tv - PRIOR.mean_m) ** 2;
    if (p.var !== undefined) { nov++; if (Math.abs(e) < 1.959964 * Math.sqrt(p.var + 1e-12)) cov++; }
  }
  const M = tp.length;
  const metrics = {
    rmse_test: Math.sqrt(te / M), mae_test: ta / M, bias_test: tb / M, rmse_prior: Math.sqrt(tp0 / M),
    map_rmse: Math.sqrt(se / (G * G)),
    cv_rmse: pos.length >= 10 ? kFoldRmse(cfg.method, pos, y, cfg, seed) : null,
    coverage95_test: nov ? cov / nov : null,
    mean_sd: null, loo_rmse: null, loo_coverage95: null, justified: null,
  };
  let scan = null;
  if (sd) {
    let s = 0;
    for (let k = 0; k < sd.length; k++) s += sd[k];
    metrics.mean_sd = s / sd.length;
    if (pos.length >= 8) {
      const loo = gpLoo(pred.model, y);
      metrics.loo_rmse = loo.rmse;
      metrics.loo_coverage95 = loo.coverage95;
      metrics.justified = loo.coverage95 >= 0.85; // over-confident intervals fail; wide ones are cautious, not wrong
    }
  }
  if (pos.length >= 8) {
    scan = [];
    for (const l of ELLS) {
      const m = gpFit(pos, y, { ...cfg, ell_km: l });
      scan.push({ ell_km: l, loo_rmse: m.ok ? gpLoo(m, y).rmse : null });
    }
  }
  // next sensor: largest posterior variance for the Gaussian process; the largest gap to every sample for the others
  let next = null;
  if (G > 0) {
    let best = -1, bv = -1;
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        const k = j * G + i;
        let v;
        if (sd) v = sd[k] * sd[k];
        else {
          v = Infinity;
          for (const p of pos) v = Math.min(v, (p[0] - cellCentre(i, G)) ** 2 + (p[1] - cellCentre(j, G)) ** 2);
          if (!pos.length) v = 1;
        }
        if (v > bv) { bv = v; best = k; }
      }
    const sn = Math.max(cfg.noise_sd_m, 1e-3);
    next = {
      x: cellCentre(best % G, G), y: cellCentre(Math.floor(best / G), G),
      rule: sd ? 'largest posterior variance' : 'largest distance to any sample (no covariance model)',
      sd_m: sd ? sd[best] : null,
      eig_nats: sd ? 0.5 * Math.log(1 + bv / (sn * sn)) : null,
    };
  }
  return { ...out, truth: truthG, mean, sd, err, metrics, scan, next };
}

// Random against adaptive placement over repeated seeds, same hyperparameters. RMSE on a 20 x 20 grid against each seed's own truth.
export function compareSampling(p, onProgress) {
  const { ell_km, noise_sd_m, roughness, seed, nSeeds = 12, nMax = 40 } = p;
  if (!(nSeeds >= 1 && nSeeds <= 40) || !(nMax >= 8 && nMax <= 60)) throw new Error('nSeeds must be 1 to 40 and nMax 8 to 60');
  const cfg = { ell_km, noise_sd_m, method: 'gp' };
  const checks = [];
  for (let n = 8; n <= nMax; n += 4) checks.push(n);
  const GE = 20;
  const rows = { random: [], adaptive: [] };
  for (let s = 0; s < nSeeds; s++) {
    const sd = deriveSeed(seed, 'e13.rep' + s);
    const T = makeTruth(sd, roughness);
    const nz = noiseDraws(sd, nMax);
    const seqs = { random: randomSequence(sd, nMax), adaptive: adaptiveSequence(sd, nMax, cfg, 16) };
    for (const kind of ['random', 'adaptive']) {
      const r = [];
      for (const n of checks) {
        const X = seqs[kind].slice(0, n), y = X.map((q, i) => T.at(q[0], q[1]) + noise_sd_m * nz[i]);
        const m = gpFit(X, y, cfg);
        let se = 0;
        for (let j = 0; j < GE; j++) for (let i = 0; i < GE; i++) {
          const x = cellCentre(i, GE), yy = cellCentre(j, GE);
          se += ((m.ok ? gpPredict(m, x, yy, false).mean : PRIOR.mean_m) - T.at(x, yy)) ** 2;
        }
        r.push(Math.sqrt(se / (GE * GE)));
      }
      rows[kind].push(r);
    }
    onProgress && onProgress((s + 1) / nSeeds);
  }
  const stat = (arr) => checks.map((_, c) => {
    const v = arr.map((r) => r[c]);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sdv = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1));
    return { mean: m, se: sdv / Math.sqrt(v.length) };
  });
  const last = checks.length - 1;
  let wins = 0;
  for (let s = 0; s < nSeeds; s++) if (rows.adaptive[s][last] < rows.random[s][last]) wins++;
  return { checks, random: stat(rows.random), adaptive: stat(rows.adaptive), wins, nSeeds, rowsRandom: rows.random, rowsAdaptive: rows.adaptive };
}

export const jobs = {
  'e13.fit': (payload, { progress }) => { progress(0.05); const r = runFit(payload.cfg, payload.seed, payload.manual); progress(1); return r; },
  'e13.compare': (payload, { progress }) => compareSampling(payload, progress),
};
