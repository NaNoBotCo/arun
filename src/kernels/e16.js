// E16 The Signal Loom — kernel. Pure functions, no DOM.
// A fictional regional aggregate: four daily indices (deliveries, cost, weather, supply), then
// aggregation, lagged correlation, additive seasonal decomposition, anomaly intervals, and a
// chronological train/test comparison of two baselines against a small linear regression.
// Every array holds regional totals per day or per bin. Nothing here is a record about a person or a trip.

import { makeRng, deriveSeed } from '../core/rng.js';
import { choleskyFactor, choleskySolve, quantileSorted } from '../core/stats.js';

export const jobs = {};

export const DAYS = 1456; // four 364-day years
export const BASE_DELIVERIES_K = 120; // thousand deliveries per day before effects
export const BASE_COST_USD = 2.4; // cost per delivery before effects
export const TRUE_LAG_DAYS = 3; // weather reaches deliveries this many days later in the generator
const WEEK = [-0.02, 0.03, 0.05, 0.06, 0.09, 0.04, -0.25]; // sums to 0

export const DEFAULTS = {
  weatherSeverity: 0.6,
  seasonality: 0.6,
  noise: 0.35,
  aggDays: 1,
  missingness: 0.05,
  disruptionDepth: 0.5,
  disruptionDays: 21,
  disruptionStart: 0.35,
  trainShare: 0.7,
  target: 'deliveries',
  anomalyZ: 3.5,
};

const RANGES = {
  weatherSeverity: [0, 1.5],
  seasonality: [0, 1],
  noise: [0, 1],
  missingness: [0, 0.9],
  disruptionDepth: [0, 0.9],
  disruptionDays: [0, 60],
  disruptionStart: [0, 1],
  trainShare: [0.5, 0.85],
  anomalyZ: [2, 8],
};

export function validate(config) {
  const c = { ...DEFAULTS, ...config };
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (!Number.isFinite(c[k]) || c[k] < lo || c[k] > hi) throw new Error(`${k} must be between ${lo} and ${hi}`);
  }
  if (![1, 7, 14].includes(c.aggDays)) throw new Error('aggDays must be 1, 7 or 14');
  if (!['deliveries', 'cost'].includes(c.target)) throw new Error('target must be deliveries or cost');
  return c;
}

export function periodBins(aggDays) {
  return aggDays === 1 ? 7 : aggDays === 7 ? 52 : 26;
}

const fin = Number.isFinite;

// ---------- generator ----------

export function generateDaily(cfg, seed, trainDaysForDisruption) {
  const N = DAYS;
  const rW = makeRng(deriveSeed(seed, 'weather'));
  const rS = makeRng(deriveSeed(seed, 'supply'));
  const rN = makeRng(deriveSeed(seed, 'noise'));
  const rM = makeRng(deriveSeed(seed, 'missing'));
  const weather = new Float64Array(N);
  const supply = new Float64Array(N);
  const deliveries = new Float64Array(N);
  const cost = new Float64Array(N);
  const observed = new Uint8Array(N);
  let storm = 0;
  for (let t = 0; t < N; t++) {
    if (rW.uniform() < 0.045) storm += 0.4 + 0.6 * rW.uniform();
    storm *= 0.62;
    const ann = 0.5 * (1 + Math.sin((2 * Math.PI * (t - 60)) / 364));
    weather[t] = cfg.weatherSeverity * (storm + 0.12 * ann);
  }
  let z = 0;
  for (let t = 0; t < N; t++) {
    z = 0.93 * z + 0.35 * rS.normal();
    supply[t] = 1.06 + 0.04 * z;
  }
  // Disruption: supply drops by depth for disruptionDays, inside the test period, ramping over two days.
  const dur = Math.round(cfg.disruptionDays);
  const room = Math.max(0, N - trainDaysForDisruption - dur);
  const dStart = trainDaysForDisruption + Math.round(cfg.disruptionStart * room);
  if (dur > 0 && cfg.disruptionDepth > 0) {
    for (let t = dStart; t < Math.min(N, dStart + dur); t++) {
      const ramp = Math.min(1, 0.5 * (t - dStart + 1));
      supply[t] *= 1 - cfg.disruptionDepth * ramp;
    }
  }
  for (let t = 0; t < N; t++) {
    const ann = Math.sin((2 * Math.PI * t) / 364 + 0.6);
    const growth = 1 + (0.12 * t) / N;
    const wl = t >= TRUE_LAG_DAYS ? weather[t - TRUE_LAG_DAYS] : 0;
    const e1 = rN.normal();
    const e2 = rN.normal();
    const demand = BASE_DELIVERIES_K * growth * (1 + cfg.seasonality * (0.18 * ann + WEEK[t % 7])) * (1 - 0.3 * wl);
    deliveries[t] = demand * Math.min(1, supply[t]) + BASE_DELIVERIES_K * cfg.noise * 0.06 * e1;
    const shortfall = Math.max(0, 1 - supply[t]);
    cost[t] = BASE_COST_USD * (1 + 0.35 * weather[t] + 1.4 * shortfall) * (1 + cfg.seasonality * 0.05 * ann) + BASE_COST_USD * cfg.noise * 0.06 * e2;
    observed[t] = rM.uniform() < cfg.missingness ? 0 : 1;
  }
  return { weather, supply, deliveries, cost, observed, disruption: { startDay: dStart, endDay: dStart + dur, depth: dur > 0 ? cfg.disruptionDepth : 0 } };
}

// Aggregate days into bins: mean of the observed days; a bin with under half its days observed is missing (NaN).
export function aggregate(daily, aggDays) {
  const nb = Math.floor(DAYS / aggDays);
  const out = {
    nb,
    aggDays,
    deliveries: new Float64Array(nb),
    cost: new Float64Array(nb),
    supply: new Float64Array(nb),
    weather: new Float64Array(nb),
    coverage: new Float64Array(nb),
  };
  const need = Math.ceil(aggDays / 2);
  for (let b = 0; b < nb; b++) {
    let n = 0, d = 0, c = 0, s = 0, w = 0;
    for (let k = 0; k < aggDays; k++) {
      const t = b * aggDays + k;
      w += daily.weather[t];
      if (daily.observed[t]) {
        n++;
        d += daily.deliveries[t];
        c += daily.cost[t];
        s += daily.supply[t];
      }
    }
    out.weather[b] = w / aggDays;
    out.coverage[b] = n / aggDays;
    if (n >= need) {
      out.deliveries[b] = d / n;
      out.cost[b] = c / n;
      out.supply[b] = s / n;
    } else {
      out.deliveries[b] = NaN;
      out.cost[b] = NaN;
      out.supply[b] = NaN;
    }
  }
  return out;
}

// ---------- analysis ----------

function median(arr) {
  const a = Float64Array.from(arr.filter(fin)).sort();
  return a.length ? quantileSorted(a, 0.5) : NaN;
}

// Classical additive decomposition. Missing values stay missing: the moving average skips them and
// a window with under 60% of its weight present gives no trend there.
export function decompose(y, P) {
  const n = y.length;
  const trend = new Float64Array(n).fill(NaN);
  const half = P >> 1;
  const even = P % 2 === 0;
  for (let i = half; i < n - half; i++) {
    let sw = 0, s = 0, total = 0;
    for (let j = i - half; j <= i + half; j++) {
      const w = even && (j === i - half || j === i + half) ? 0.5 : 1;
      total += w;
      if (fin(y[j])) {
        s += w * y[j];
        sw += w;
      }
    }
    if (sw >= 0.6 * total) trend[i] = s / sw;
  }
  const sums = new Float64Array(P);
  const cnt = new Float64Array(P);
  for (let i = 0; i < n; i++) {
    if (fin(y[i]) && fin(trend[i])) {
      sums[i % P] += y[i] - trend[i];
      cnt[i % P]++;
    }
  }
  const profile = new Float64Array(P);
  let pm = 0, pc = 0;
  for (let k = 0; k < P; k++) {
    profile[k] = cnt[k] ? sums[k] / cnt[k] : NaN;
    if (fin(profile[k])) {
      pm += profile[k];
      pc++;
    }
  }
  pm = pc ? pm / pc : 0;
  for (let k = 0; k < P; k++) profile[k] = fin(profile[k]) ? profile[k] - pm : 0;
  const seasonal = new Float64Array(n);
  const remainder = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    seasonal[i] = profile[i % P];
    remainder[i] = fin(y[i]) && fin(trend[i]) ? y[i] - trend[i] - seasonal[i] : NaN;
  }
  return { trend, seasonal, remainder, profile, period: P };
}

// Pearson correlation of x[t-k] with y[t] for k = -maxLag..maxLag. Positive k: x leads y.
export function laggedCorrelation(x, y, maxLag) {
  const out = [];
  const n = x.length;
  for (let k = -maxLag; k <= maxLag; k++) {
    let m = 0, sx = 0, sy = 0;
    for (let t = 0; t < n; t++) {
      const j = t - k;
      if (j < 0 || j >= n || !fin(x[j]) || !fin(y[t])) continue;
      m++;
      sx += x[j];
      sy += y[t];
    }
    let r = NaN;
    if (m >= 8) {
      const mx = sx / m, my = sy / m;
      let sxy = 0, sxx = 0, syy = 0;
      for (let t = 0; t < n; t++) {
        const j = t - k;
        if (j < 0 || j >= n || !fin(x[j]) || !fin(y[t])) continue;
        const a = x[j] - mx, b = y[t] - my;
        sxy += a * b;
        sxx += a * a;
        syy += b * b;
      }
      r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
    }
    out.push({ lag: k, r, n: m });
  }
  return out;
}

// Z-scores from the median and MAD and runs of flagged bins merged into intervals.
export function anomalyIntervals(rem, zThreshold) {
  const med = median(rem);
  const mad = median(Array.from(rem, (v) => (fin(v) ? Math.abs(v - med) : NaN)));
  let sigma = 1.4826 * mad;
  if (!(sigma > 1e-12)) sigma = 1e-12;
  const z = new Float64Array(rem.length);
  const flagged = [];
  for (let i = 0; i < rem.length; i++) {
    z[i] = fin(rem[i]) ? (rem[i] - med) / sigma : NaN;
    if (fin(z[i]) && Math.abs(z[i]) > zThreshold) flagged.push(i);
  }
  const intervals = [];
  for (const i of flagged) {
    const last = intervals[intervals.length - 1];
    if (last && i - last.end <= 1) {
      last.end = i;
      last.n++;
      if (Math.abs(z[i]) > Math.abs(last.peakZ)) last.peakZ = z[i];
    } else intervals.push({ start: i, end: i, n: 1, peakZ: z[i] });
  }
  return { intervals, z, median: med, sigma };
}

// Ordinary least squares y ~ X (rows of equal length; the caller adds the intercept column).
// Ridge adds lambda to the diagonal except column 0. Returns null when the system is singular.
export function fitOLS(rows, y, lambda = 0) {
  const p = rows[0].length;
  const A = new Float64Array(p * p);
  const b = new Float64Array(p);
  for (let r = 0; r < rows.length; r++) {
    const x = rows[r];
    for (let i = 0; i < p; i++) {
      b[i] += x[i] * y[r];
      for (let j = 0; j <= i; j++) A[i * p + j] += x[i] * x[j];
    }
  }
  for (let i = 0; i < p; i++) {
    for (let j = i + 1; j < p; j++) A[i * p + j] = A[j * p + i];
    if (i > 0) A[i * p + i] += lambda;
  }
  const L = choleskyFactor(A, p);
  if (!L) return null;
  return Array.from(choleskySolve(L, p, b));
}

function rmseOf(err) {
  if (!err.length) return NaN;
  let s = 0;
  for (const e of err) s += e * e;
  return Math.sqrt(s / err.length);
}
function maeOf(err) {
  if (!err.length) return NaN;
  let s = 0;
  for (const e of err) s += Math.abs(e);
  return s / err.length;
}

// Chronological forecast comparison. Everything learned (seasonal profile, lag choice, coefficients,
// standardisation, interval width) uses bins before trainEnd only. A forecast for bin t uses
// weather at t-lag (lag >= 1), supply at t-1 and the target at t-1 and t-P: all earlier than t.
export function evaluateForecast(series, target, cfg, trainEnd, disruptionBins) {
  const nb = series.nb;
  const P = periodBins(series.aggDays);
  const y = series[target];
  const w = series.weather;
  const s = series.supply;
  const notes = [];
  if (trainEnd < 2 * P) return { ok: false, reason: `Training period has ${trainEnd} bins; ${2 * P} are needed for two seasonal cycles. Use a shorter aggregation interval or a larger train share.` };

  const yTrain = y.subarray(0, trainEnd);
  const decY = decompose(yTrain, P);
  const decW = decompose(w.subarray(0, trainEnd), P);
  const maxLag = Math.max(2, Math.min(14, Math.floor(trainEnd / 8)));
  const lc = laggedCorrelation(decW.remainder, decY.remainder, maxLag);
  const lcRaw = laggedCorrelation(w.subarray(0, trainEnd), yTrain, maxLag);
  let best = null;
  for (const e of lc) if (e.lag >= 1 && fin(e.r) && (!best || Math.abs(e.r) > Math.abs(best.r))) best = e;
  const lag = best ? best.lag : 1;

  const feat = (t) => {
    const yl = y[t - 1], wl = w[t - lag], sl = s[t - 1], yp = y[t - P];
    if (t - lag < 0 || t - P < 0 || !fin(yl) || !fin(wl) || !fin(sl) || !fin(yp)) return null;
    return [t / nb, decY.profile[t % P], wl, sl, yl];
  };
  // Training rows
  const Xr = [], yr = [];
  for (let t = Math.max(P, lag, 1); t < trainEnd; t++) {
    const f = feat(t);
    if (f && fin(y[t])) {
      Xr.push(f);
      yr.push(y[t]);
    }
  }
  if (Xr.length < 30) return { ok: false, reason: `Only ${Xr.length} complete training rows (30 are needed). Lower the missingness.` };
  const p = Xr[0].length;
  const mu = new Float64Array(p), sd = new Float64Array(p);
  for (const f of Xr) for (let j = 0; j < p; j++) mu[j] += f[j] / Xr.length;
  for (const f of Xr) for (let j = 0; j < p; j++) sd[j] += (f[j] - mu[j]) ** 2 / Xr.length;
  for (let j = 0; j < p; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const Z = Xr.map((f) => [1, ...f.map((v, j) => (v - mu[j]) / sd[j])]);
  const beta = fitOLS(Z, yr, 1e-6 * Z.length);
  if (!beta) return { ok: false, reason: 'The regression design is singular (a feature has no variation in training). Raise weather severity or noise.' };
  const predict = (f) => {
    let v = beta[0];
    for (let j = 0; j < p; j++) v += beta[j + 1] * ((f[j] - mu[j]) / sd[j]);
    return v;
  };
  let trainSS = 0;
  for (let i = 0; i < Z.length; i++) {
    let v = beta[0];
    for (let j = 0; j < p; j++) v += beta[j + 1] * Z[i][j + 1];
    trainSS += (yr[i] - v) ** 2;
  }
  const trainSd = Math.sqrt(trainSS / Math.max(1, Z.length - p - 1));

  const idx = [], actual = [], fNaive = [], fSeas = [], fReg = [];
  let skipped = 0;
  for (let t = trainEnd; t < nb; t++) {
    if (!fin(y[t])) {
      skipped++;
      continue;
    }
    const f = feat(t);
    if (!f) {
      skipped++;
      continue;
    }
    idx.push(t);
    actual.push(y[t]);
    fNaive.push(y[t - 1]);
    fSeas.push(y[t - P]);
    fReg.push(predict(f));
  }
  if (idx.length < 10) return { ok: false, reason: `Only ${idx.length} test bins have every input observed (10 are needed). Lower the missingness or the aggregation interval.` };
  const errN = idx.map((_, i) => fNaive[i] - actual[i]);
  const errS = idx.map((_, i) => fSeas[i] - actual[i]);
  const errR = idx.map((_, i) => fReg[i] - actual[i]);
  const inD = (t) => t >= disruptionBins[0] && t < disruptionBins[1];
  const split = (err) => {
    const a = [], b = [];
    idx.forEach((t, i) => (inD(t) ? a : b).push(err[i]));
    return { inside: rmseOf(a), outside: rmseOf(b), nInside: a.length };
  };
  const z80 = 1.2816;
  let covered = 0;
  idx.forEach((_, i) => {
    if (Math.abs(errR[i]) <= z80 * trainSd) covered++;
  });
  const score = (err) => ({ rmse: rmseOf(err), mae: maeOf(err), ...split(err) });
  const sc = { naive: score(errN), seasonal: score(errS), regression: score(errR) };
  const bestBase = Math.min(sc.naive.rmse, sc.seasonal.rmse);
  return {
    ok: true,
    period: P,
    lag,
    lagCorr: lc,
    lagCorrRaw: lcRaw,
    profile: Array.from(decY.profile),
    coefficients: { intercept: beta[0], names: ['time', 'seasonal profile', `weather (lag ${lag})`, 'supply (lag 1)', 'target (lag 1)'], standardised: beta.slice(1), mu: Array.from(mu), sd: Array.from(sd) },
    trainSd,
    trainRows: Z.length,
    index: idx,
    actual,
    naive: fNaive,
    seasonal: fSeas,
    regression: fReg,
    band80: z80 * trainSd,
    coverage80: covered / idx.length,
    scores: sc,
    skill: 1 - sc.regression.rmse / bestBase,
    bestBaseline: sc.naive.rmse <= sc.seasonal.rmse ? 'naive' : 'seasonal',
    scored: idx.length,
    skipped,
    notes,
  };
}

// ---------- the run ----------

export function run(config, seed) {
  const cfg = validate(config);
  if (!Number.isInteger(seed) || seed < 0) throw new Error('seed must be a whole number from 0');
  const agg = cfg.aggDays;
  const nb = Math.floor(DAYS / agg);
  const trainBins = Math.floor(nb * cfg.trainShare);
  const daily = generateDaily(cfg, seed, trainBins * agg);
  const series = aggregate(daily, agg);
  const P = periodBins(agg);
  const y = series[cfg.target];
  const dec = decompose(y, P);
  const an = anomalyIntervals(dec.remainder, cfg.anomalyZ);
  const dBins = [Math.floor(daily.disruption.startDay / agg), Math.ceil(daily.disruption.endDay / agg)];
  if (daily.disruption.depth === 0) dBins[1] = dBins[0];
  const missingBins = [];
  for (let b = 0; b < nb; b++) if (!fin(y[b])) missingBins.push(b);
  let detected = false;
  for (const iv of an.intervals) if (iv.end >= dBins[0] && iv.start < dBins[1]) detected = true;
  const fc = evaluateForecast(series, cfg.target, cfg, trainBins, dBins);
  return {
    ok: fc.ok,
    reason: fc.ok ? null : fc.reason,
    config: cfg,
    seed,
    nb,
    aggDays: agg,
    period: P,
    trainEnd: trainBins,
    disruptionBins: dBins,
    disruptionDetected: dBins[1] > dBins[0] ? detected : null,
    series,
    decomposition: dec,
    anomalies: { intervals: an.intervals, z: an.z, median: an.median, sigma: an.sigma, threshold: cfg.anomalyZ },
    missingBins,
    missingShare: missingBins.length / nb,
    forecast: fc,
    notes: [
      'A correlation is not a cause. The lag is the shift with the strongest correlation in the training period.',
      'Missing bins stay missing; no value is filled in.',
    ],
  };
}

// Aggregate columns only: one row per bin. No per-day or per-record rows.
export function toTable(result) {
  const s = result.series;
  const cols = ['bin', 'day_start', 'deliveries_k', 'cost_usd_per_delivery', 'weather_index', 'supply_index', 'coverage', 'missing', 'split'];
  const rows = [];
  for (let b = 0; b < result.nb; b++) {
    rows.push([
      b, b * result.aggDays,
      fin(s.deliveries[b]) ? s.deliveries[b] : null,
      fin(s.cost[b]) ? s.cost[b] : null,
      s.weather[b],
      fin(s.supply[b]) ? s.supply[b] : null,
      s.coverage[b],
      fin(s[result.config.target][b]) ? 0 : 1,
      b < result.trainEnd ? 'train' : 'test',
    ]);
  }
  return { columns: cols, rows };
}
