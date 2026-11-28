// A simulated 48 hours in Phnom Penh, Fri 27 – Sat 28 Nov 2026: traffic at junctions, PM2.5 and AQI,
// rain, water on the street, the river, and the warnings a sensing city would issue. Every value is
// simulated; nothing here is a measurement of the real city. Pure functions, no DOM.
//
// Time m is in scenario minutes after 15:00 on Fri 27 Nov (the clock of storm.js and world.js).
// The window runs from Fri 00:00 (m = −900) to Sun 00:00 (m = 1980).
import { makeStorm, rainAt } from '../kernels/storm.js';
import { streetDepth, HYDRO } from '../kernels/hydro.js';
import { mulberry32 } from '../kernels/rng.js';

export const SIM_VERSION = 'touch-sim/0.1';
export const M0 = -900, M1 = 1980, STEP = 5;           // window and sample step, minutes
const MS = M0 - 720;                                   // simulated from 12 h earlier, so the first NowCast has its history
export const STORM_SEED = 1;
export const HEAVY = 25;                               // mm/h, as in nowcast.js
export const KERB = HYDRO.kerbCm;                      // cm of water that counts as "water at the kerb"
export const QUEUE_ALERT = 250;                        // m of queue that raises a traffic alert
export const AQI_ALERT = 151;                          // "Unhealthy" and above
export const SPACING = 2.5;                            // m of queue per waiting vehicle, mostly motorbikes, across lanes

const g = (h, c, w) => Math.exp(-0.5 * ((h - c) / w) ** 2);
export const clock = m => { const a = 900 + m; const d = Math.floor(a / 1440); return { day: d, h: (a - d * 1440) / 60 }; };
export const label = m => { const { day, h } = clock(m); const hh = Math.floor(h), mm = Math.round((h - hh) * 60) % 60; return { day, hhmm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` }; };

// ---------- traffic ----------
// Share of the day's peak flow at minute m. Friday has two rush hours; Saturday a softer morning.
export function trafficProfile(m) {
  const { day, h } = clock(m);
  const H = [h - 24, h, h + 24];
  const f = x => day === 1
    ? 0.08 + 0.55 * g(x, 8.2, 1.4) + 0.7 * g(x, 12.5, 2.2) + 0.85 * g(x, 17.8, 1.6) + 0.45 * g(x, 21, 1.8)
    : 0.08 + 0.95 * g(x, 7.6, 1.0) + 0.55 * g(x, 12.2, 1.6) + 0.95 * g(x, 17.6, 1.3) + 0.35 * g(x, 20.5, 2.0);
  return Math.min(1.05, Math.max(...H.map(f)));
}

// Junctions: graph vertices where three or more mapped roads (major or minor) meet, in the central city,
// picked by a fixed rule (busiest first, at least 700 m apart). Illustrative camera sites, not real cameras.
export function pickJunctions(graph, { max = 28, spacing = 700, box = { x: 6200, y: 5600 } } = {}) {
  const cand = [];
  for (let n = 0; n < graph.x.length; n++) {
    if (graph.comp[n] !== graph.largest) continue;
    const x = graph.x[n], y = graph.y[n];
    if (Math.abs(x + 800) > box.x || Math.abs(y) > box.y) continue;
    let big = 0, imp = 0;
    for (let k = graph.adjStart[n]; k < graph.adjStart[n + 1]; k++) {
      const c = graph.edges[graph.adjEdge[k]].cls;
      if (c <= 1) big++;
      imp += c === 0 ? 3 : c === 1 ? 2 : 0.5;
    }
    if (big >= 3) cand.push({ n, x, y, imp });
  }
  cand.sort((a, b) => b.imp - a.imp || a.n - b.n);
  const out = [];
  for (const c of cand) {
    if (out.some(o => Math.hypot(o.x - c.x, o.y - c.y) < spacing)) continue;
    out.push(c);
    if (out.length >= max) break;
  }
  return out.map((c, i) => ({ id: `J-${String(i + 1).padStart(2, '0')}`, node: c.n, x: Math.round(c.x), y: Math.round(c.y), imp: c.imp }));
}

// Day 3 handoff, W01: Q' = max(0, Q + arrivals − departures), departures bounded by the vehicles there and by capacity.
export function queueStep(Q, arrivals, capacity) {
  const departures = Math.min(Q + arrivals, Math.max(0, capacity));
  return { Q: Math.max(0, Q + arrivals - departures), departures };
}

// ---------- rain and water ----------
export const storm = makeStorm(STORM_SEED);
export const rainAtM = (x, y, m) => (m < 0 || m > 180 ? 0 : rainAt(storm, x, y, m));
// Water on the street at a junction (cm), minute 0..359 after 15:00: the street bucket of hydro.js.
export function waterSeries(x, y) {
  const r = new Float32Array(360);
  for (let t = 0; t <= 180; t++) r[t] = rainAt(storm, x, y, t);
  return streetDepth(r, HYDRO);
}

// ---------- air ----------
// A PM2.5 field (µg/m³) on a grid over the mapped area: regional background, traffic near busy roads,
// a low night-time mixing layer that holds both near the ground, and rain that washes the air.
export const AIR = { B: 20, Bsat: 3, K: 42, washScale: 6, washTau: 360, wind: { x: -60, y: -60 } }; // wind in m per minute, from the north-east
export function mixing(m) { const { h } = clock(m); const H = [h - 24, h, h + 24]; return 0.62 + Math.max(...H.map(x => 0.85 * g(x, 6.3, 2.0) + 0.5 * g(x, 22.5, 2.6))); }

export function roadDensity(geo, grid) {
  const { nx, ny, x0, y0, x1, y1 } = grid, a = new Float32Array(nx * ny);
  const W = { major: 3, minor: 2, streets: 0.6 };
  for (const [k, w] of Object.entries(W)) for (const p of geo[k] || []) for (let i = 0; i + 3 < p.length; i += 2) {
    const L = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]), n = Math.max(1, Math.ceil(L / 20));
    for (let s = 0; s < n; s++) {
      const f = (s + 0.5) / n, x = p[i] + (p[i + 2] - p[i]) * f, y = p[i + 1] + (p[i + 3] - p[i + 1]) * f;
      const c = Math.floor((x - x0) / (x1 - x0) * nx), r = Math.floor((y1 - y) / (y1 - y0) * ny);
      if (c >= 0 && r >= 0 && c < nx && r < ny) a[r * nx + c] += w * L / n;
    }
  }
  const tmp = new Float32Array(a.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) { let s = 0, k = 0; for (let d = -2; d <= 2; d++) { const cc = c + d; if (cc >= 0 && cc < nx) { s += a[r * nx + cc]; k++; } } tmp[r * nx + c] = s / k; }
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) { let s = 0, k = 0; for (let d = -2; d <= 2; d++) { const rr = r + d; if (rr >= 0 && rr < ny) { s += tmp[rr * nx + c]; k++; } } a[r * nx + c] = s / k; }
  }
  const sorted = Float32Array.from(a).sort(), p99 = sorted[Math.floor(sorted.length * 0.99)] || 1;
  for (let i = 0; i < a.length; i++) a[i] = Math.min(1.2, a[i] / p99);
  return a;
}

// smooth value noise that drifts with the wind
function noise2(x, y, seed) {
  const h = (i, j) => { let v = Math.imul(i, 374761393) + Math.imul(j, 668265263) + seed * 1442695041; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}

export function makeAir(geo, grid) {
  const R = roadDensity(geo, grid);
  // rain memory over the city: mean of five points, minute by minute, decaying with washTau
  const pts = [[-1500, 600], [-4000, 1500], [-2500, -2500], [500, 2500], [800, -1500]];
  const wash = new Float32Array(M1 - MS + 1);
  let D = 0;
  for (let m = MS; m <= M1; m++) {
    let r = 0; for (const [x, y] of pts) r += rainAtM(x, y, m); r /= pts.length;
    D = D * Math.exp(-1 / AIR.washTau) + r / 60;
    wash[m - MS] = 1 / (1 + D / AIR.washScale);
  }
  const washAt = m => wash[Math.max(0, Math.min(wash.length - 1, Math.round(m) - MS))];
  const rAt = (x, y) => {
    const { nx, ny, x0, y0, x1, y1 } = grid;
    const c = Math.floor((x - x0) / (x1 - x0) * nx), r = Math.floor((y1 - y) / (y1 - y0) * ny);
    return c >= 0 && r >= 0 && c < nx && r < ny ? R[r * nx + c] : 0;
  };
  const bg = m => AIR.B + (clock(m).day === 1 ? AIR.Bsat : 0);
  // dry-weather shape at a point: what the forecaster "knows" about the daily rhythm (no rain)
  const shape = (rd, m) => (bg(m) + AIR.K * rd * trafficProfile(m)) * mixing(m);
  const at = (x, y, m, rd = rAt(x, y)) => {
    const n = 0.85 + 0.3 * noise2((x - AIR.wind.x * m) / 2500, (y - AIR.wind.y * m) / 2500, 7);
    return shape(rd, m) * washAt(m) * n;
  };
  function field(m, out) {
    const { nx, ny, x0, y0, x1, y1 } = grid, a = out || new Float32Array(nx * ny);
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const x = x0 + (c + 0.5) * (x1 - x0) / nx, y = y1 - (r + 0.5) * (y1 - y0) / ny;
      a[r * nx + c] = at(x, y, m, R[r * nx + c]);
    }
    return a;
  }
  return { R, rAt, at, field, shape, washAt, grid };
}

// US EPA AQI for PM2.5 (breakpoints as revised in 2024). c in µg/m³.
const BP = [[0, 9, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500]];
export function aqi(c) {
  if (!Number.isFinite(c)) return NaN;
  const x = Math.floor(Math.max(0, c) * 10) / 10;
  for (const [cl, ch, il, ih] of BP) if (x <= ch) return Math.round((ih - il) / (ch - cl) * (x - cl) + il);
  return 500;
}
export const CATS = [
  { max: 50, key: 'good', col: '#3ccf6e' }, { max: 100, key: 'moderate', col: '#f2d94e' }, { max: 150, key: 'usg', col: '#ff9a3c' },
  { max: 200, key: 'unhealthy', col: '#ff4d4d' }, { max: 300, key: 'veryUnhealthy', col: '#b05cd6' }, { max: 1e9, key: 'hazardous', col: '#a0324a' },
];
export const catOf = a => CATS.find(c => a <= c.max);
// EPA NowCast from hourly means, most recent first.
export function nowcast(hourly) {
  const c = hourly.slice(0, 12).filter(Number.isFinite);
  if (c.length < 2) return NaN;
  const w = Math.max(0.5, Math.min(...c) / Math.max(...c));
  let s = 0, n = 0; for (let i = 0; i < c.length; i++) { s += Math.pow(w, i) * c[i]; n += Math.pow(w, i); }
  return s / n;
}

// ---------- the whole simulated window at the junctions ----------
// fixture: { junctions: [{ id, x, y, imp, tWarn }] } — tWarn from nowcast.js warning() at build time.
export function simulate(geo, fixture, grid) {
  const air = makeAir(geo, grid);
  const N = (M1 - MS) / STEP + 1;
  const J = fixture.junctions.map((j, idx) => {
    const r = mulberry32(idx * 7919 + 17);
    const peak = Math.min(110, 25 + 6 * j.imp);                    // vehicles per minute at the busiest hour
    const water = waterSeries(j.x, j.y);
    const rd = air.rAt(j.x, j.y);
    const pm = new Float32Array(N), queue = new Float32Array(N), flow = new Float32Array(N), rain = new Float32Array(N), wat = new Float32Array(N);
    let Q = 0, k = 0;
    for (let m = MS; m <= M1; m++) {
      const rr = rainAtM(j.x, j.y, m), ww = m >= 0 && m < 360 ? water[m] : 0;
      const wobble = 1 + 0.08 * Math.sin(m / 37 + idx) + 0.05 * Math.sin(m / 11 + idx * 3);
      const divert = 1 / (1 + Q * SPACING / 500);               // some drivers avoid a long queue
      const arr = peak * trafficProfile(m) * (1 - 0.35 * Math.min(1, rr / 40)) * wobble * divert;
      const cap = peak * 1.1 * (1 - 0.3 * Math.min(1, rr / 50)) * (ww >= KERB ? 0.55 : ww >= 5 ? 0.8 : 1);
      Q = queueStep(Q, arr, cap).Q;
      if ((m - MS) % STEP === 0) {
        const noise = 1 + (r() - 0.5) * 0.1;                        // a low-cost sensor, about ±5%
        pm[k] = air.at(j.x, j.y, m, rd) * noise; queue[k] = Q * SPACING; flow[k] = arr; rain[k] = rr; wat[k] = ww; k++;
      }
    }
    return { ...j, peak, rd, pm, queue, flow, rain, water: wat };
  });
  const idx = m => Math.max(0, Math.min(N - 1, Math.round((m - MS) / STEP)));
  const hourMean = (a, m) => { let s = 0, n = 0; for (let t = m - 55; t <= m; t += STEP) { const i = (t - MS) / STEP; if (i >= 0 && i < N) { s += a[Math.round(i)]; n++; } } return n ? s / n : NaN; };
  const aqiAt = (j, m) => { const h = []; for (let k = 0; k < 12; k++) h.push(hourMean(j.pm, m - 60 * k)); return aqi(nowcast(h)); };
  return { J, air, N, idx, hourMean, aqiAt };
}

// ---------- warnings and alerts ----------
// Air: at each step the forecaster takes the last hour's mean at each sensor and carries it forward on
// that sensor's dry-weather daily shape; it warns when the next 3 hours reach "Unhealthy". The event is
// the NowCast AQI reaching "Unhealthy". Traffic: an alert, not a warning, when a queue passes 250 m.
// Rain and water: tWarn comes from the nowcast kernel (chance of heavy rain within 90 minutes ≥ 50%).
export function alerts(S) {
  const out = [];
  const none = v => (v == null || v < 0 ? null : v);       // the storm kernels use −1 for "never"
  // air episodes, city-wide
  let ep = null;
  for (let m = M0; m <= M1; m += 10) {
    let warnAny = null; const over = [];
    for (const j of S.J) {
      const now = S.hourMean(j.pm, m), a = S.aqiAt(j, m);
      if (a >= AQI_ALERT) over.push(j);
      const base = S.air.shape(j.rd, m - 30);
      let fmax = 0; for (let k = 30; k <= 180; k += 30) fmax = Math.max(fmax, now * S.air.shape(j.rd, m + k) / base);
      if (a < AQI_ALERT && fmax >= 55.5 && (!warnAny || fmax > warnAny.f)) warnAny = { j, f: fmax };
    }
    if (!ep && (warnAny || over.length)) { const w = warnAny ? warnAny.j : over[0]; ep = { kind: 'air', issue: warnAny ? m : null, at: w.id, x: w.x, y: w.y, event: null, end: null, n: 0 }; }
    if (ep && ep.event == null && over.length) { ep.event = m; const w = over.reduce((a, b) => (S.aqiAt(b, m) > S.aqiAt(a, m) ? b : a)); ep.at = w.id; ep.x = w.x; ep.y = w.y; }
    if (ep) ep.n = Math.max(ep.n, over.length);
    if (ep && ((ep.event != null && !over.length) || (ep.event == null && !warnAny && m - ep.issue > 240))) { ep.end = m; if (ep.event == null) ep.falseAlarm = true; out.push(ep); ep = null; }
  }
  if (ep) { ep.end = M1; out.push(ep); }
  // rain and street water, from the kernel's per-junction warnings
  const rainJ = S.J.filter(j => none(j.tWarn) != null || none(j.tHeavy) != null);
  if (rainJ.length) {
    const warned = rainJ.filter(j => none(j.tWarn) != null), heavy = rainJ.filter(j => none(j.tHeavy) != null);
    const ok = j => none(j.tWarn) != null && j.tWarn < j.tHeavy;
    const leads = heavy.filter(ok).map(j => j.tHeavy - j.tWarn).sort((a, b) => a - b);
    const first = heavy.length ? heavy.reduce((a, b) => (a.tHeavy <= b.tHeavy ? a : b)) : warned[0];
    out.push({ kind: 'rain', issue: warned.length ? Math.min(...warned.map(j => j.tWarn)) : null, event: heavy.length ? Math.min(...heavy.map(j => j.tHeavy)) : null,
      end: Math.max(...heavy.map(j => j.tHeavyEnd)) + 1, n: heavy.length, warned: warned.length, missed: heavy.filter(j => !ok(j)).length,
      falseWarn: warned.filter(j => none(j.tHeavy) == null).length, lead: leads.length ? leads[leads.length >> 1] : null, at: first.id, x: first.x, y: first.y });
    const wet = S.J.filter(j => none(j.tWater) != null);
    if (wet.length) {
      const f = wet.reduce((a, b) => (a.tWater <= b.tWater ? a : b));
      const okw = j => none(j.tWarn) != null && j.tWarn < j.tWater;
      const wl = wet.filter(okw).map(j => j.tWater - j.tWarn).sort((a, b) => a - b);
      out.push({ kind: 'water', issue: wet.some(okw) ? Math.min(...wet.filter(okw).map(j => j.tWarn)) : null, event: f.tWater, end: Math.max(...wet.map(j => j.tDry)),
        n: wet.length, missed: wet.filter(j => !okw(j)).length, lead: wl.length ? wl[wl.length >> 1] : null, at: f.id, x: f.x, y: f.y });
    }
  }
  // traffic episodes, city-wide: alerts when a queue passes 250 m, not forecasts
  let tr = null;
  for (let m = M0; m <= M1; m += STEP) {
    const k = S.idx(m), over = S.J.filter(j => j.queue[k] >= QUEUE_ALERT);
    if (!tr && over.length) { const w = over.reduce((a, b) => (a.queue[k] >= b.queue[k] ? a : b)); tr = { kind: 'traffic', issue: null, event: m, end: null, at: w.id, x: w.x, y: w.y, n: 0 }; }
    if (tr) tr.n = Math.max(tr.n, over.length);
    if (tr && !over.length) { tr.end = m; out.push(tr); tr = null; }
  }
  if (tr) { tr.end = M1; out.push(tr); }
  return out.sort((a, b) => (a.issue ?? a.event) - (b.issue ?? b.event));
}

// Junction facts from the storm that need no forecast: first heavy rain, water at the kerb and back below it.
export function rainFacts(j) {
  let tHeavy = -1, tHeavyEnd = -1, peakRain = 0;
  for (let t = 0; t <= 180; t++) { const r = rainAt(storm, j.x, j.y, t); if (r > peakRain) peakRain = r; if (r >= HEAVY) { if (tHeavy < 0) tHeavy = t; tHeavyEnd = t; } }
  const w = waterSeries(j.x, j.y);
  let tWater = -1, tDry = -1, peakCm = 0;
  for (let t = 0; t < w.length; t++) { if (w[t] > peakCm) peakCm = w[t]; if (w[t] >= KERB) { if (tWater < 0) tWater = t; tDry = t + 1; } }
  return { tHeavy, tHeavyEnd, peakRain: Math.round(peakRain), tWater, tDry, peakCm: Math.round(peakCm * 10) / 10 };
}

// The river at Chaktomuk, simulated: late-November recession, a few centimetres from the storm. Not gauge data.
export const riverStage = m => 3.9 - 0.11 * (m - M0) / 1440 + (m > 60 ? 0.04 * Math.exp(-(m - 60) / 600) * Math.min(1, (m - 60) / 120) : 0);
