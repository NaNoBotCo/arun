// E04 The Map That Learns: correct a biased background map with noisy point sensors.
// Two methods: Gaussian-kernel residual correction, and optimal interpolation (a Kalman update).
// Held-out truth is used only to score, never to fit.

import { makeRng, deriveSeed } from '../core/rng.js';
import { choleskyFactor, choleskySolve, rmse, mae, mean } from '../core/stats.js';

export const METHOD_VERSION = 'e04-oi-kernel-1.0.0';

export function validate(c) {
  const R = { G: [16, 80], L: [0.5, 30], sigmaB: [0.1, 40], sigmaAssumed: [0, 40], sigmaActual: [0, 40], bias: [-30, 30], errAmp: [0, 30], hour: [0, 24] };
  for (const [k, [lo, hi]] of Object.entries(R)) if (!(typeof c[k] === 'number' && c[k] >= lo && c[k] <= hi)) throw new Error(`${k} must be between ${lo} and ${hi}.`);
  if (!['oi', 'kernel'].includes(c.method)) throw new Error('method must be oi or kernel.');
  if (!Array.isArray(c.sensors) || c.sensors.length > 120) throw new Error('Up to 120 sensors.');
}

// Fictional daily rain (mm): a few storm cells drifting east with the hour, on a gentle gradient.
export function truthField(G, seed, hour) {
  const rng = makeRng(deriveSeed(seed, 'truth'));
  const blobs = Array.from({ length: 5 }, () => ({ x: rng.range(0.05, 0.75), y: rng.range(0.1, 0.9), a: rng.range(12, 34), s: rng.range(0.07, 0.16) }));
  const f = new Float64Array(G * G);
  const drift = (hour / 24) * 0.3;
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      const x = i / (G - 1), y = j / (G - 1);
      let v = 6 + 8 * y;
      for (const b of blobs) v += b.a * Math.exp(-((x - b.x - drift) ** 2 + (y - b.y) ** 2) / (2 * b.s * b.s));
      f[j * G + i] = v;
    }
  return f;
}

export function backgroundField(truth, G, seed, bias, errAmp) {
  const rng = makeRng(deriveSeed(seed, 'background'));
  const p1 = rng.range(0, 6.28), p2 = rng.range(0, 6.28);
  const b = new Float64Array(G * G);
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      const x = i / (G - 1), y = j / (G - 1);
      b[j * G + i] = Math.max(0, truth[j * G + i] + bias + errAmp * Math.sin(2.1 * Math.PI * x + p1) * Math.cos(1.7 * Math.PI * y + p2));
    }
  return b;
}

// Each sensor's noise comes from its own stream keyed by its cell, so adding a sensor leaves the others unchanged.
export function observe(truth, sensors, seed, sigmaActual) {
  return sensors.map((cell) => truth[cell] + sigmaActual * makeRng(deriveSeed(seed, 'obs' + cell)).normal());
}

export function sensorLayout(kind, n, G, seed) {
  const rng = makeRng(deriveSeed(seed, 'layout:' + kind));
  const cells = new Set();
  if (kind === 'grid') {
    const k = Math.max(1, Math.round(Math.sqrt(n)));
    for (let a = 0; a < k; a++) for (let b = 0; b < k && cells.size < n; b++) cells.add(Math.round(((a + 0.5) / k) * (G - 1)) * G + Math.round(((b + 0.5) / k) * (G - 1)));
  } else if (kind === 'clustered') {
    let guard = 0;
    while (cells.size < n && guard++ < 5000) cells.add(Math.floor(rng.range(0, G * 0.3)) * G + Math.floor(rng.range(0, G * 0.3)));
  } else {
    let guard = 0;
    while (cells.size < n && guard++ < 5000) cells.add(rng.int(G) * G + rng.int(G));
  }
  return [...cells];
}

function d2(G, a, b) {
  const ax = a % G, ay = Math.floor(a / G), bx = b % G, by = Math.floor(b / G);
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

export function analyse(c, background, obs) {
  const { G, sensors, L, sigmaB, sigmaAssumed, method } = c;
  const n = G * G, m = sensors.length;
  const xa = Float64Array.from(background);
  const sd = new Float64Array(n).fill(sigmaB);
  if (m === 0) return { xa, sd, ok: true, uncertaintyJustified: method === 'oi' };
  const dvec = new Float64Array(m);
  for (let k = 0; k < m; k++) dvec[k] = obs[k] - background[sensors[k]];
  const inv2L2 = 1 / (2 * L * L);
  if (method === 'kernel') {
    const lam = sigmaB > 0 ? (sigmaAssumed * sigmaAssumed) / (sigmaB * sigmaB) : 0;
    for (let cIdx = 0; cIdx < n; cIdx++) {
      let num = 0, den = 0;
      for (let k = 0; k < m; k++) {
        const w = Math.exp(-d2(G, cIdx, sensors[k]) * inv2L2);
        num += w * dvec[k];
        den += w;
      }
      xa[cIdx] = background[cIdx] + num / (den + lam + 1e-12);
    }
    return { xa, sd: null, ok: true, uncertaintyJustified: false };
  }
  // Optimal interpolation: x_a = x_b + B Hᵀ (H B Hᵀ + R)⁻¹ (y − H x_b), via Cholesky.
  const s2 = sigmaB * sigmaB;
  const S = new Float64Array(m * m);
  for (let a = 0; a < m; a++)
    for (let b = 0; b < m; b++) S[a * m + b] = s2 * Math.exp(-d2(G, sensors[a], sensors[b]) * inv2L2) + (a === b ? sigmaAssumed * sigmaAssumed + 1e-9 * s2 : 0);
  const Lc = choleskyFactor(S, m);
  if (!Lc) return { xa, sd, ok: false, reason: 'The innovation matrix is not positive definite (two sensors share a cell with zero assumed noise). Raise the assumed noise.' };
  const alpha = choleskySolve(Lc, m, dvec);
  const bc = new Float64Array(m);
  const z = new Float64Array(m);
  for (let cIdx = 0; cIdx < n; cIdx++) {
    let inc = 0;
    for (let k = 0; k < m; k++) {
      bc[k] = s2 * Math.exp(-d2(G, cIdx, sensors[k]) * inv2L2);
      inc += bc[k] * alpha[k];
    }
    xa[cIdx] = background[cIdx] + inc;
    // Posterior variance σ_b² − bᵀ S⁻¹ b via forward substitution.
    let q = 0;
    for (let i = 0; i < m; i++) {
      let s = bc[i];
      for (let k = 0; k < i; k++) s -= Lc[i * m + k] * z[k];
      z[i] = s / Lc[i * m + i];
      q += z[i] * z[i];
    }
    sd[cIdx] = Math.sqrt(Math.max(0, s2 - q));
  }
  return { xa, sd, ok: true, uncertaintyJustified: true };
}

// Score on held-out truth: every cell without a sensor.
export function score(truth, background, xa, sensors, G) {
  const mask = new Uint8Array(G * G);
  for (const s of sensors) mask[s] = 1;
  const t = [], b = [], a = [];
  for (let i = 0; i < G * G; i++)
    if (!mask[i]) {
      t.push(truth[i]);
      b.push(background[i]);
      a.push(xa[i]);
    }
  return { rmseBackground: rmse(b, t), rmseAnalysis: rmse(a, t), maeBackground: mae(b, t), maeAnalysis: mae(a, t), heldOut: t.length };
}

export function run(c, seed) {
  validate(c);
  const truth = truthField(c.G, seed, c.hour);
  const background = backgroundField(truth, c.G, seed, c.bias, c.errAmp);
  const obs = observe(truth, c.sensors, seed, c.sigmaActual);
  const an = analyse(c, background, obs);
  const sc = score(truth, background, an.xa, c.sensors, c.G);
  // Synthetic mapping to E02: ratio of mean analysis to mean background over the region.
  const forcingMultiplier = Math.min(2, Math.max(0.5, mean(an.xa) / Math.max(1e-9, mean(background))));
  return { truth, background, obs, ...an, ...sc, forcingMultiplier };
}

export const jobs = {
  'e04.run': ({ config, seed }) => run(config, seed),
  // Compare layouts over repeated seeds: mean held-out RMSE by strategy.
  'e04.layouts': ({ config, seeds }, { progress }) => {
    const out = {};
    const kinds = ['random', 'grid', 'clustered'];
    kinds.forEach((kind, i) => {
      const r = [];
      for (const s of seeds) r.push(run({ ...config, sensors: sensorLayout(kind, config.sensors.length || 16, config.G, s) }, s).rmseAnalysis);
      out[kind] = { meanRmse: mean(r), runs: r.length };
      progress && progress((i + 1) / kinds.length);
    });
    return out;
  },
};
