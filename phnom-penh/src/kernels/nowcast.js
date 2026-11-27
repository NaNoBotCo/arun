// Nowcast from sparse sensors: fit the storm's motion from the times rain began at each sensor,
// carry each sensor's record forward along that motion (Lagrangian persistence), and run an ensemble
// over the motion's uncertainty. Only reports already received are used; the storm truth is not.
import { mulberry32, normal } from './rng.js';
import { observe as adapt } from './observe.js';

export const HEAVY = 25;     // mm/h: "heavy rain" for warnings and scores
export const ONSET = 8;      // mm/h: a sensor's rain has begun
export const LC = 1500;      // m: how far across the storm's track one sensor's record is trusted
export const MEMBERS = 48;
export const WMIN = 0.05;     // summed weight below which a forecast value has no evidence behind it
export const MIN_COVER = 0.5; // share of the 90-minute window with evidence below which "no notice" means "unavailable"
export const KERNEL_VERSION = 'nowcast/11.0';

// The latest minute index whose report has arrived by time tNow (which may be fractional).
// A reading for minute m arrives at m + latency. Everything the forecast reads is clamped to this.
export const knownIndex = (o, tNow) => Math.floor(tNow - o.lat + 1e-9);

// Readings come through the observation adapter (src/kernels/observe.js); the forecast reads only these.
export const observe = (storm, sensors, seed = 1, opts = {}) => adapt(storm, sensors, seed, opts);

// The first minute a sensor reads rain: 3 mm/h for gauges, the first non-zero step for cameras.
// A low bar matters: a storm that strengthens on its way crosses a high bar sooner downstream,
// which reads as a faster storm.
export const FIRST = { gauge: 3, roof: 3, camera: 5 };
function onsetOf(o, tNow) {
  const last = Math.min(o.rep.length - 1, knownIndex(o, tNow)), bar = FIRST[o.kind] || 3;
  for (let t = 0; t <= last; t++) if (o.rep[t] >= bar) {
    // sub-minute: interpolate between the dry minute and this one
    const p = t > 0 && o.rep[t - 1] === o.rep[t - 1] ? o.rep[t - 1] : 0;
    return o.rep[t] > p ? t - 1 + (bar - p) / (o.rep[t] - p) : t;
  }
  return -1;
}

// Time the heaviest rain passed a sensor, once it has passed (the reading has fallen well below its
// peak). Unlike the time rain began, it does not shift when the storm strengthens on its way.
function peakOf(o, tNow) {
  const last = Math.min(o.rep.length - 1, knownIndex(o, tNow));
  if (last < 0) return -1;
  let mx = 0, at = -1;
  for (let t = 0; t <= last; t++) if (o.rep[t] > mx) { mx = o.rep[t]; at = t; }
  if (mx < ONSET || at > last - 3 || !(o.rep[last] < 0.6 * mx)) return -1;
  let sw = 0, st = 0;
  for (let t = at; t >= 0 && o.rep[t] >= 0.85 * mx; t--) { sw += o.rep[t]; st += o.rep[t] * t; }
  for (let t = at + 1; t <= last && o.rep[t] >= 0.85 * mx; t++) { sw += o.rep[t]; st += o.rep[t] * t; }
  return st / sw;
}

// Least squares t_i = t0 + sx*x_i + sy*y_i. Slowness s in min/m. Uses the times the heaviest rain
// passed when three or more sensors have seen it pass; before that, the times rain began.
export function fitMotion(obs, tNow) {
  let pts = [];
  for (const o of obs) { const t = peakOf(o, tNow); if (t >= 0) pts.push([o.x, o.y, t, o.id]); }
  const fromPeaks = pts.length >= 3 && spread(pts);
  if (!fromPeaks) { pts = []; for (const o of obs) { const t = onsetOf(o, tNow); if (t >= 0) pts.push([o.x, o.y, t, o.id]); } }
  if (pts.length < 3) return null;
  const fit = fitPlane(pts);
  if (fit) fit.basis = fromPeaks ? 'peak' : 'onset';
  return fit;
}
function spread(pts) {
  let mx = 0, my = 0; for (const [x, y] of pts) { mx += x; my += y; } mx /= pts.length; my /= pts.length;
  let sxx = 0, sxy = 0, syy = 0; for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
  return sxx * syy - sxy * sxy >= 1e10;
}
function fitPlane(pts) {
  let mx = 0, my = 0, mt = 0;
  for (const [x, y, t] of pts) { mx += x; my += y; mt += t; }
  mx /= pts.length; my /= pts.length; mt /= pts.length;
  let sxx = 0, sxy = 0, syy = 0, sxt = 0, syt = 0;
  for (const [x, y, t] of pts) { const dx = x - mx, dy = y - my, dt = t - mt; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxt += dx * dt; syt += dy * dt; }
  const det = sxx * syy - sxy * sxy;
  if (det < 1e10) return null;                                  // sensors nearly in a line: motion not determined
  const sx = (syy * sxt - sxy * syt) / det, sy = (sxx * syt - sxy * sxt) / det;
  const s2 = sx * sx + sy * sy;
  if (s2 < 1e-10) return null;
  let ssr = 0;
  for (const [x, y, t] of pts) { const e = t - (mt + sx * (x - mx) + sy * (y - my)); ssr += e * e; }
  const sigma2 = Math.max(2.25, pts.length > 3 ? ssr / (pts.length - 3) : 9);   // at least 1.5 min of timing error
  const cov = [sigma2 * syy / det, -sigma2 * sxy / det, sigma2 * sxx / det];    // [var sx, cov, var sy]
  const vx = sx / s2, vy = sy / s2;
  // each sensor's time against the fitted plane: the residuals the evidence view shows
  const points = pts.map(([x, y, t, id]) => { const f = mt + sx * (x - mx) + sy * (y - my); return { id, x, y, t, fitted: f, resid: t - f }; });
  return { points, n: pts.length, sx, sy, cov, sigma: Math.sqrt(sigma2), vx, vy, speedKmh: Math.hypot(vx, vy) * 60 / 1000, headingDeg: Math.atan2(vy, vx) * 180 / Math.PI };
}

export function members(fit, seed = 1, m = MEMBERS) {
  const r = mulberry32(seed * 31 + fit.n * 1009);
  const a = Math.sqrt(Math.max(fit.cov[0], 0)), b = fit.cov[1] / (a || 1), c = Math.sqrt(Math.max(fit.cov[2] - b * b, 0));
  const out = [];
  for (let k = 0; k < m; k++) {
    const z1 = normal(r), z2 = normal(r);
    const sx = fit.sx + a * z1, sy = fit.sy + b * z1 + c * z2, s2 = sx * sx + sy * sy;
    let vx = sx / s2, vy = sy / s2;
    const sp = Math.hypot(vx, vy), cl = Math.min(1000, Math.max(80, sp));           // 5..60 km/h
    vx *= cl / sp; vy *= cl / sp;
    out.push({ vx, vy, g: Math.exp(0.25 * normal(r)) });                             // g: growth or decay
  }
  return out;
}

// The report nearest minute t, looking up to 2 minutes either side, but never past kmax, the latest
// minute received. A missing report (NaN) stays missing; it is not read as zero rain.
export function valueAt(rep, t, kmax) {
  const top = Math.min(rep.length - 1, Math.floor(kmax));
  const i = Math.round(t);
  for (let d = 0; d <= 2; d++) {
    const a = i - d, b = i + d;
    if (a >= 0 && a <= top && rep[a] === rep[a]) return rep[a];
    if (d && b >= 0 && b <= top && rep[b] === rep[b]) return rep[b];
  }
  return NaN;
}

// Forecast rain at (px,py) for lead minutes 0..tauMax for one motion member. Returns {v, w} arrays:
// v is mm/h, NaN where the summed weight w is below WMIN (no sensor upstream has reported for that lead).
export function forecastPoint(obs, tNow, mem, px, py, tauMax = 120, step = 2) {
  const nT = Math.floor(tauMax / step) + 1, v = new Float32Array(nT), w = new Float32Array(nT);
  const sp2 = mem.vx * mem.vx + mem.vy * mem.vy, sp = Math.sqrt(sp2);
  for (const o of obs) {
    const dx = px - o.x, dy = py - o.y;
    const travel = (dx * mem.vx + dy * mem.vy) / sp2;                 // minutes from sensor to point
    const dc = Math.abs(dx * mem.vy - dy * mem.vx) / sp;              // metres across the track
    const wc = Math.exp(-(dc * dc) / (2 * LC * LC)) * Math.exp(-Math.max(0, travel) / 150);
    if (wc < 1e-3) continue;
    const known = knownIndex(o, tNow);
    if (known < 0) continue;
    for (let k = 0; k < nT; k++) {
      const tau = k * step, ts = tNow + tau - travel;
      if (ts > known || ts < 0) continue;
      const r = valueAt(o.rep, ts, known);
      if (r !== r) continue;
      v[k] += wc * r; w[k] += wc;
    }
  }
  for (let k = 0; k < nT; k++) v[k] = w[k] >= WMIN ? (v[k] / w[k]) * Math.pow(mem.g, (k * step) / 60) : NaN;
  return { v, w };
}

// Chance of heavy rain at a point within `window` minutes, from the ensemble at tNow.
// p counts members that reach HEAVY on a lead with evidence; leads without evidence count as unknown,
// so p is a lower bound and cover says how much of the window had evidence (0..1).
export function heavyChance(obs, tNow, mems, px, py, window = 90, step = 2) {
  let hit = 0, cov = 0;
  for (const m of mems) {
    const { v } = forecastPoint(obs, tNow, m, px, py, window, step);
    let mx = -1, n = 0; for (const x of v) if (x === x) { n++; if (x > mx) mx = x; }
    cov += n / v.length;
    if (mx >= HEAVY) hit++;
  }
  return { p: hit / mems.length, cover: cov / mems.length };
}

// Ensemble summary at a point: per lead, the 10th, 50th and 90th percentile of the members with evidence,
// and the share of members with evidence. Below half, the lead is unavailable (NaN).
export function pointSummary(obs, tNow, mems, px, py, tauMax = 120, step = 2) {
  const nT = Math.floor(tauMax / step) + 1, all = mems.map(m => forecastPoint(obs, tNow, m, px, py, tauMax, step).v);
  const p10 = new Float32Array(nT), p50 = new Float32Array(nT), p90 = new Float32Array(nT), cover = new Float32Array(nT);
  for (let k = 0; k < nT; k++) {
    const col = [];
    for (let i = 0; i < mems.length; i++) if (all[i][k] === all[i][k]) col.push(all[i][k]);
    col.sort((a, b) => a - b);
    cover[k] = col.length / mems.length;
    if (cover[k] < 0.5) { p10[k] = p50[k] = p90[k] = NaN; continue; }
    p10[k] = col[Math.floor(0.1 * (col.length - 1))]; p50[k] = col[Math.floor(0.5 * (col.length - 1))]; p90[k] = col[Math.floor(0.9 * (col.length - 1))];
  }
  return { step, p10, p50, p90, cover };
}

// The minute a warning goes out: the first minute the chance of heavy rain within 90 minutes reaches `p`,
// or the facility's own gauge reads heavy rain. obs must include the facility's roof gauge (kind 'roof').
// state per minute: 0 no motion fit yet, 1 forecast with evidence over at least MIN_COVER of the window,
// 2 forecast with too little evidence (a low chance there means "unavailable", not "safe"), 3 roof gauge heavy.
export function warning(obs, facility, opts = {}) {
  const { p = 0.5, seed = 1, t1 = 180 } = opts;
  const roof = obs.find(o => o.kind === 'roof');
  const chance = new Float32Array(t1 + 1), cover = new Float32Array(t1 + 1), state = new Uint8Array(t1 + 1);
  let tWarn = -1, firstFit = -1, lastSig = '', mems = null, fitAtWarn = null;
  for (let t = 0; t <= t1; t++) {
    let c = 0, cv = 0, st = 0;
    const fit = fitMotion(obs, t);
    if (fit) {
      if (firstFit < 0) firstFit = t;
      const sig = fit.n + ':' + fit.sx.toFixed(8) + ':' + fit.sy.toFixed(8);
      if (sig !== lastSig) { mems = members(fit, seed); lastSig = sig; }
      const hc = heavyChance(obs, t, mems, facility.x, facility.y);
      c = hc.p; cv = hc.cover; st = cv >= MIN_COVER || c >= p ? 1 : 2;
    }
    if (roof) { const k = knownIndex(roof, t); if (k >= 0 && roof.rep[k] >= HEAVY) { c = 1; cv = 1; st = 3; } }
    chance[t] = c; cover[t] = cv; state[t] = st;
    if (tWarn < 0 && c >= p) { tWarn = t; fitAtWarn = fit; }
  }
  return { tWarn, chance, cover, state, firstFit, fitAtWarn };
}

// Forecast field for lead `tau` on a grid with the fitted mean motion (one member, g = 1).
export function fieldForecast(obs, tNow, fit, tau, grid, out) {
  const { x0, y0, x1, y1, nx, ny } = grid, a = out || new Float32Array(nx * ny);
  if (!fit) { a.fill(0); return a; }
  const mem = { vx: fit.vx, vy: fit.vy, g: 1 };
  const step = Math.max(1, tau);
  for (let j = 0; j < ny; j++) {
    const y = y1 - (j + 0.5) * (y1 - y0) / ny;
    for (let i = 0; i < nx; i++) {
      const { v } = forecastPoint(obs, tNow, mem, x0 + (i + 0.5) * (x1 - x0) / nx, y, tau, step);
      a[j * nx + i] = v[v.length - 1];
    }
  }
  return a;
}

// What the sensors say now, spread around them (no motion). The "no forecast" baseline.
export function analysisNow(obs, tNow, grid, out) {
  const { x0, y0, x1, y1, nx, ny } = grid, a = out || new Float32Array(nx * ny);
  const L2 = 2 * LC * LC;
  for (let j = 0; j < ny; j++) {
    const y = y1 - (j + 0.5) * (y1 - y0) / ny;
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * (x1 - x0) / nx;
      let sv = 0, sw = 0;
      for (const o of obs) {
        const k = knownIndex(o, tNow); if (k < 0) continue;
        const r = valueAt(o.rep, k, k); if (r !== r) continue;
        const d2 = (x - o.x) ** 2 + (y - o.y) ** 2, w = Math.exp(-d2 / L2);
        sv += w * r; sw += w;
      }
      a[j * nx + i] = sw >= WMIN ? sv / sw : NaN;
    }
  }
  return a;
}

// Scores on a separate truth grid: critical success index for heavy rain, and RMSE where it rains.
// A cell with no forecast (NaN) counts as a miss where heavy rain fell and is left out of the RMSE;
// cover is the share of cells with a forecast.
export function score(pred, truth, thr = HEAVY) {
  let hits = 0, misses = 0, fa = 0, se = 0, n = 0, avail = 0;
  for (let k = 0; k < pred.length; k++) {
    const has = pred[k] === pred[k], p = has && pred[k] >= thr, o = truth[k] >= thr;
    if (has) avail++;
    if (p && o) hits++; else if (o) misses++; else if (p) fa++;
    if (has && (pred[k] > 1 || truth[k] > 1)) { se += (pred[k] - truth[k]) ** 2; n++; }
  }
  const den = hits + misses + fa;
  return { csi: den ? hits / den : NaN, rmse: n ? Math.sqrt(se / n) : NaN, hits, misses, falseAlarms: fa, cover: pred.length ? avail / pred.length : 0 };
}
