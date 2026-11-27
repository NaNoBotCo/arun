// Observation adapter: what each proposed sensor reports, minute by minute, from the illustrative storm.
// The storm (truth) only reaches the forecast through here, as readings with a time, a quality flag and
// an error. Cameras: the drawn street scene's own pixel measurement of rain (data/camera-calibration.json,
// made by tools/calibrate-camera.mjs from renders of src/lenses/faceshield/scene.js), plus an assumed
// field error for the gap between a drawn scene and a camera on a street. Gauges: a tipping bucket.
import { mulberry32, normal, hash32 } from './rng.js';
import { series } from './storm.js';
import { KINDS } from './sensors.js';
import CALIB from '../../data/camera-calibration.json' with { type: 'json' };

export const ADAPTER_VERSION = 'observe/11.0';
export const NIGHT_T = 162;                      // scenario minute of dusk on 27 Nov (17:42)
export const Q = { ok: 0, night: 1, missing: 2 };
export const OBS_DEFAULTS = { fieldError: 0.25, drop: 0.02, delay: 0, noiseScale: 1 };
export const CALIBRATION = CALIB;

export function validateObsOptions(o = {}) {
  const v = { ...OBS_DEFAULTS, ...o };
  const ok = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  if (!ok(v.fieldError, 0, 2) || !ok(v.drop, 0, 0.9) || !ok(v.delay, 0, 60) || !ok(v.noiseScale, 0, 10) || v.delay !== Math.floor(v.delay)) throw new Error('bad observation options ' + JSON.stringify(o));
  return v;
}

// The scene's measured rain (mean and spread) at a true rate R, by linear interpolation in the table.
export function sceneReading(R, night) {
  const tb = CALIB.table[night ? 'night' : 'day'];
  if (!(R > 0)) return { mean: 0, sd: 0 };
  for (let i = 1; i < tb.length; i++) if (R <= tb[i][0]) {
    const [r0, m0, s0] = tb[i - 1], [r1, m1, s1] = tb[i], u = (R - r0) / (r1 - r0);
    return { mean: m0 + u * (m1 - m0), sd: s0 + u * (s1 - s0) };
  }
  const a = tb[tb.length - 2], b = tb[tb.length - 1];
  return { mean: b[1] + (R - b[0]) * (b[1] - a[1]) / (b[0] - a[0]), sd: b[2] * R / b[0] };
}
const quantize = v => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));

function cameraSeries(s, truth, seed, o) {
  const r = mulberry32((hash32(s.id) ^ (seed * 2654435761) ^ 0x5bd1e995) >>> 0);
  const rep = new Float32Array(truth.length), q = new Uint8Array(truth.length);
  for (let t = 0; t < truth.length; t++) {
    const night = t >= NIGHT_T, sc = sceneReading(truth[t], night);
    const z1 = normal(r), z2 = normal(r), u = r();
    let v = sc.mean + sc.sd * o.noiseScale * z1;
    v *= 1 + o.fieldError * o.noiseScale * z2;
    if (u < o.drop) { rep[t] = NaN; q[t] = Q.missing; continue; }
    rep[t] = quantize(Math.max(0, v)); q[t] = night ? Q.night : Q.ok;
  }
  return { rep, q };
}

// Same random sequence as sensors.reports() at default options, so gauge readings are unchanged from v10.
function gaugeSeries(s, truth, seed, o) {
  const k = KINDS[s.kind];
  const r = mulberry32(hash32(s.id) ^ (seed * 2654435761));
  const calib = 1 + (r() - 0.5) * 0.1 * o.noiseScale;
  const drop = s.kind === 'roof' ? 0 : o.drop;
  const rep = new Float32Array(truth.length), q = new Uint8Array(truth.length), tips = new Int32Array(truth.length);
  let depth = 0;
  for (let t = 0; t < truth.length; t++) { depth += truth[t] * calib / 60; tips[t] = Math.floor(depth / k.tip); }
  for (let t = 0; t < truth.length; t++) {
    const t0 = Math.max(0, t - k.window);
    const rate = (tips[t] - tips[t0]) * k.tip * 60 / Math.max(1, t - t0);
    if (r() < drop) { rep[t] = NaN; q[t] = Q.missing; } else rep[t] = rate;
  }
  return { rep, q };
}

const cache = new Map();
const stormKey = st => `${st.seed}:${st.headingDeg.toFixed(4)}:${st.speedKmh.toFixed(4)}:${st.tArrive.toFixed(3)}:${st.cells.length}`;
export function clearObsCache() { cache.clear(); }

// One record per sensor that is on. rep: mm/h per minute (NaN = missing), q: quality per minute,
// lat: minutes from the rain to the reading's arrival (sensor latency + any added delay).
export function observe(storm, sensors, seed = 1, opts = {}) {
  const o = validateObsOptions(opts), sk = stormKey(storm);
  return sensors.filter(s => s.on !== false).map(s => {
    if (!KINDS[s.kind]) throw new Error('unknown sensor kind ' + s.kind);
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) throw new Error('sensor without a position ' + s.id);
    const key = `${sk}|${seed}|${s.id}|${s.kind}|${s.x}|${s.y}|${o.fieldError}|${o.drop}|${o.noiseScale}`;
    let rec = cache.get(key);
    if (!rec) {
      const truth = series(storm, s.x, s.y);
      rec = s.kind === 'camera' ? cameraSeries(s, truth, seed, o) : gaugeSeries(s, truth, seed, o);
      if (cache.size > 6000) cache.clear();
      cache.set(key, rec);
    }
    return { id: s.id, kind: s.kind, x: s.x, y: s.y, lat: KINDS[s.kind].latency + (s.kind === 'roof' ? 0 : o.delay), rep: rec.rep, q: rec.q, src: 'synthetic' };
  });
}

// The table checked against conditions never used to build it: mean absolute error of the table's
// mean reading against single-frame measurements, by day and night.
export function heldOutCheck() {
  const rows = CALIB.heldout.flatMap(h => h.measured.map(m => ({ R: h.R, night: h.night, m, pred: sceneReading(h.R, h.night).mean })));
  const err = rows.map(r => Math.abs(r.pred - r.m)), rel = rows.filter(r => r.R >= 5).map(r => Math.abs(r.pred - r.m) / r.R);
  return { n: rows.length, mae: err.reduce((a, b) => a + b, 0) / rows.length, maxRel: Math.max(...rel), meanRel: rel.reduce((a, b) => a + b, 0) / rel.length };
}
