// E03 Probability Loom: paired Monte Carlo of an investment's net benefit with common random numbers.
// Each path has its own seeded stream, so baseline and intervention see identical storms,
// and any single path can be recomputed exactly for inspection.

import { makeRng, deriveSeed } from '../core/rng.js';
import { quantileSorted, sortedCopy, mean } from '../core/stats.js';

export const METHOD_VERSION = 'e03-paired-mc-1.0.0';
export const REF_DEPTH_M = 0.45; // standalone mode: depth at the asset for a storm of multiplier 1

export const LIMITS = {
  paths: [10, 10000], horizon_y: [10, 30], freq_per_y: [0, 6], severity: [0.2, 2.5], variability: [0, 1.2],
  correlation: [0, 0.95], efficacy: [0, 1], capex_usd: [0, 5e7], opex_usd_y: [0, 5e6], discount: [0, 0.2],
  exposedValue_usd: [0, 1e8], downtime_usd_h: [0, 1e6],
};

export function validate(c) {
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const v = c[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${k} must be between ${lo} and ${hi}.`);
  }
  if (!Number.isInteger(c.paths) || !Number.isInteger(c.horizon_y)) throw new Error('paths and horizon_y must be whole numbers.');
}

// Fictional depth–damage curve: share of exposed value lost at depth d (m).
export function damageShare(d) {
  if (!(d > 0.05)) return 0;
  return Math.min(1, Math.pow((d - 0.05) / 1.5, 0.8));
}

function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0] * Math.max(0, x / xs[0]); // below the sweep: scale toward zero
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
  const n = xs.length - 1;
  const slope = (ys[n] - ys[n - 1]) / (xs[n] - xs[n - 1]);
  return ys[n] + slope * (x - xs[n]); // linear extension above the sweep
}

// Turn E02's sweep rows into the curves this kernel reads.
export function hazardFromSweep(rows) {
  return {
    multipliers: rows.map((r) => r.multiplier),
    basePeak: rows.map((r) => r.baseline.hotelPeak_m),
    baseHours: rows.map((r) => r.baseline.hotelHoursAbove),
    altPeak: rows.map((r) => r.intervention.hotelPeak_m),
    altHours: rows.map((r) => r.intervention.hotelHoursAbove),
  };
}

// Losses for one storm of multiplier m, both arms.
export function stormLoss(c, m, hazard) {
  let db, da, hb, ha;
  if (hazard) {
    db = Math.max(0, interp(hazard.multipliers, hazard.basePeak, m));
    da = Math.max(0, interp(hazard.multipliers, hazard.altPeak, m));
    hb = Math.max(0, interp(hazard.multipliers, hazard.baseHours, m));
    ha = Math.max(0, interp(hazard.multipliers, hazard.altHours, m));
  } else {
    db = REF_DEPTH_M * m;
    hb = Math.max(0, 4 * (m - 0.45));
    const lb = c.exposedValue_usd * damageShare(db) + c.downtime_usd_h * hb;
    return { depthBase: db, depthAlt: db, lossBase: lb, lossAlt: (1 - c.efficacy) * lb };
  }
  return {
    depthBase: db,
    depthAlt: da,
    lossBase: c.exposedValue_usd * damageShare(db) + c.downtime_usd_h * hb,
    lossAlt: c.exposedValue_usd * damageShare(da) + c.downtime_usd_h * ha,
  };
}

// One path, year by year. Returns events for inspection when wanted.
export function simulatePath(c, seed, p, hazard, wantEvents = false) {
  const rng = makeRng(deriveSeed(seed, 'path' + p));
  const H = c.horizon_y;
  const cum = new Float64Array(H + 1);
  cum[0] = -c.capex_usd;
  let x = rng.normal(); // stationary start of the AR(1) climate factor
  let pvBase = 0, pvAlt = 0;
  const events = wantEvents ? [] : null;
  const s2 = c.variability * c.variability;
  const mu = Math.log(c.severity) - s2 / 2; // keeps E[m] = severity
  for (let t = 1; t <= H; t++) {
    x = c.correlation * x + Math.sqrt(1 - c.correlation * c.correlation) * rng.normal();
    const n = rng.poisson(c.freq_per_y);
    let lb = 0, la = 0;
    const storms = wantEvents ? [] : null;
    for (let k = 0; k < n; k++) {
      const z = rng.normal();
      const m = Math.exp(mu + c.variability * (0.6 * x + 0.8 * z));
      const s = stormLoss(c, m, hazard);
      lb += s.lossBase;
      la += s.lossAlt;
      if (storms) storms.push({ m, ...s });
    }
    const disc = Math.pow(1 + c.discount, -t);
    pvBase += lb * disc;
    pvAlt += la * disc;
    cum[t] = cum[t - 1] + (lb - la - c.opex_usd_y) * disc;
    if (events) events.push({ year: t, climate: x, storms, lossBase: lb, lossAlt: la });
  }
  return { cum, nb: cum[H], pvBase, pvAlt, events };
}

export function summarize(nb, pvBase, pvAlt) {
  const s = sortedCopy(nb);
  const n = s.length;
  const k = Math.max(1, Math.floor(0.05 * n));
  const worstNB = mean(s.subarray(0, k));
  const sb = sortedCopy(pvBase), sa = sortedCopy(pvAlt);
  let pos = 0;
  for (const v of nb) if (v > 0) pos++;
  return {
    paths: n,
    mean: mean(nb),
    median: quantileSorted(s, 0.5),
    q05: quantileSorted(s, 0.05),
    q95: quantileSorted(s, 0.95),
    pPositive: pos / n,
    esNB5: worstNB,
    meanLossBase: mean(pvBase),
    meanLossAlt: mean(pvAlt),
    esLossBase5: mean(sb.subarray(n - k)),
    esLossAlt5: mean(sa.subarray(n - k)),
    stdErrMean: Math.sqrt(s.reduce((a, v) => a + (v - mean(nb)) ** 2, 0) / Math.max(1, n - 1) / n),
  };
}

export function runLoom(c, seed, hazard = null, onProgress) {
  validate(c);
  const P = c.paths, H = c.horizon_y;
  const cum = new Float32Array(P * (H + 1));
  const nb = new Float64Array(P);
  const pvBase = new Float64Array(P);
  const pvAlt = new Float64Array(P);
  for (let p = 0; p < P; p++) {
    const r = simulatePath(c, seed, p, hazard);
    cum.set(r.cum, p * (H + 1));
    nb[p] = r.nb;
    pvBase[p] = r.pvBase;
    pvAlt[p] = r.pvAlt;
    if (onProgress && p % 250 === 0) onProgress(p / P);
  }
  for (const v of nb) if (!Number.isFinite(v)) throw new Error('A path produced a non-finite value; the run stopped.');
  // Year-by-year quantile band for the loom.
  const band = [];
  const col = new Float64Array(P);
  for (let t = 0; t <= H; t++) {
    for (let p = 0; p < P; p++) col[p] = cum[p * (H + 1) + t];
    const s = sortedCopy(col);
    band.push([t, quantileSorted(s, 0.05), quantileSorted(s, 0.5), quantileSorted(s, 0.95)]);
  }
  return { cum, nb, pvBase, pvAlt, band, stats: summarize(nb, pvBase, pvAlt), horizon: H, paths: P };
}

// Analytic expected net benefit when severity is fixed (variability 0): a check for the Monte Carlo.
export function analyticMeanNB(c, hazard = null) {
  const s = stormLoss(c, c.severity, hazard);
  let pv = 0;
  for (let t = 1; t <= c.horizon_y; t++) pv += (c.freq_per_y * (s.lossBase - s.lossAlt) - c.opex_usd_y) * Math.pow(1 + c.discount, -t);
  return pv - c.capex_usd;
}

export const jobs = {
  'e03.loom': ({ config, seed, hazard }, { progress }) => runLoom(config, seed, hazard, progress),
};
