// Shared pieces for the resilience lab: random streams, outage patterns, run segments, summaries.
import { mulberry32, normal, hash32 } from '../../kernels/rng.js';
export { mulberry32, normal, hash32 };

export const DAY = 1440;
export const stream = (seed, name) => mulberry32(hash32(`${seed}:${name}`));

// Assumed device and cost values. The user edits them; they are labelled assumed in the page.
export const ASSUMED = {
  sleepMA: 0.01,          // idle draw, mA
  mAhSample: 0.004,       // one reading, mAh
  mAhMsg: 0.08,           // one radio message, mAh
  mAhPerSampleInMsg: 0.002, // each reading carried in a message, mAh
  failFrac: 0.25,         // share of a message's energy spent on a failed attempt
  costMsg: 0.002,         // cost units per delivered message
  costVisit: 3,           // cost units per record pickup
  costSwap: 1,            // cost units per battery swap
};

export const COMMON = {
  days: 7, interval: 15, linkKind: 'scattered', linkLen: 120, battery: 1000,
  mode: 'direct', batch: 6, pickupDays: 3, localAlert: false, assumed: {},
};

// Outage intervals [a,b) in minutes. Starts depend on the seed and kind only, so a longer
// length stretches the same outages.
export function outages(kind, len, H, rand, rate = 1) {
  const out = [];
  if (kind === 'none' || !(len > 0)) return out;
  if (kind === 'daily') {
    for (let d = 0; d * DAY < H; d++) { const a = d * DAY + 18 * 60 + Math.round((rand() - 0.5) * 120); out.push([a, a + len]); }
  } else if (kind === 'single') {
    const a = Math.round(H * (0.25 + rand() * 0.4)); out.push([a, a + len]);
  } else {
    const n = Math.max(1, Math.round(H / DAY * rate));
    for (let i = 0; i < n; i++) { const a = Math.floor(rand() * H); const f = 0.6 + 0.8 * rand(); out.push([a, a + Math.max(5, Math.round(len * f))]); }
  }
  out.sort((x, y) => x[0] - y[0]);
  const m = [];
  for (const [a0, b0] of out) {
    const a = Math.max(0, a0), b = Math.min(H, b0);
    if (b <= a) continue;
    if (m.length && a <= m[m.length - 1][1]) m[m.length - 1][1] = Math.max(m[m.length - 1][1], b); else m.push([a, b]);
  }
  return m;
}

export function maskOf(iv, H) {
  const m = new Uint8Array(H);
  for (const [a, b] of iv) m.fill(1, a, Math.min(H, b));
  return m;
}

// Contiguous runs where pred(value) holds. Returns [{start, end}] with end exclusive.
export function segments(arr, pred, mergeGap = 0) {
  const out = []; let s = -1;
  for (let t = 0; t < arr.length; t++) {
    const on = pred(arr[t]);
    if (on && s < 0) s = t;
    if (!on && s >= 0) { out.push({ start: s, end: t }); s = -1; }
  }
  if (s >= 0) out.push({ start: s, end: arr.length });
  const m = [];
  for (const e of out) { const l = m[m.length - 1]; if (l && e.start - l.end <= mergeGap) l.end = e.end; else m.push({ ...e }); }
  return m;
}

export function normals(rand, n) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = normal(rand); return a; }

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}
export function median(a) { return quantile([...a].sort((x, y) => x - y), 0.5); }
export function summarize(values) {
  const v = values.filter(Number.isFinite).sort((x, y) => x - y);
  return { n: v.length, p10: quantile(v, 0.1), med: quantile(v, 0.5), p90: quantile(v, 0.9), min: v[0], max: v[v.length - 1], values: v };
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const bump = (h, c, w) => { let d = Math.abs(h - c); if (d > 12) d = 24 - d; return Math.exp(-(d * d) / (2 * w * w)); };
