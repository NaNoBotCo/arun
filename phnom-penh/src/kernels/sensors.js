// Proposed sensors and what they would report. Positions are proposals on mapped streets, not an
// inventory of cameras or gauges that exist. Readings are simulated from the illustrative storm.
import { mulberry32, hash32 } from './rng.js';

export const KINDS = {
  camera: { latency: 1, note: 'rain class from a street camera after Face Shield, 5 mm/h steps, about ±25%' },
  gauge: { latency: 1, tip: 0.2, window: 5, note: 'tipping bucket, 0.2 mm per tip, rate over the last 5 minutes' },
  roof: { latency: 1, tip: 0.2, window: 5, note: "the facility's own roof gauge" },
};

// Proposed positions (metres from 104.93 E, 11.56 N), snapped to the nearest mapped road point at build time.
export const PROPOSED = [
  { id: 'c1', kind: 'camera', at: [-6400, -1400] }, { id: 'c2', kind: 'camera', at: [-5200, 1900] },
  { id: 'c3', kind: 'camera', at: [-3900, -3100] }, { id: 'c4', kind: 'camera', at: [-2700, 500] },
  { id: 'c5', kind: 'camera', at: [-1300, 2500] }, { id: 'c6', kind: 'camera', at: [200, -2300] },
  { id: 'c7', kind: 'camera', at: [-600, 600] }, { id: 'c8', kind: 'camera', at: [2400, 1700] },
  { id: 'g1', kind: 'gauge', at: [-8000, 300] }, { id: 'g2', kind: 'gauge', at: [-7100, 3600] },
  { id: 'g3', kind: 'gauge', at: [-6900, -4000] }, { id: 'g4', kind: 'gauge', at: [-4500, 700] },
  { id: 'g5', kind: 'gauge', at: [-3100, -1600] }, { id: 'g6', kind: 'gauge', at: [-1900, -3900] },
  { id: 'g7', kind: 'gauge', at: [-400, 1700] }, { id: 'g8', kind: 'gauge', at: [2700, -1900] },
  // the wider ring: gauges 10-18 km out along the main roads
  { id: 'r1', kind: 'gauge', ring: 'region', at: [-17000, 1500] }, { id: 'r2', kind: 'gauge', ring: 'region', at: [-14000, -7500] },
  { id: 'r3', kind: 'gauge', ring: 'region', at: [-13500, 8500] }, { id: 'r4', kind: 'gauge', ring: 'region', at: [-11000, -1000] },
  { id: 'r5', kind: 'gauge', ring: 'region', at: [-7000, -13000] }, { id: 'r6', kind: 'gauge', ring: 'region', at: [-6000, 12500] },
];

export function snapToRoads(points, geo) {
  const pts = [];
  for (const k of ['major', 'minor', 'streets']) for (const p of geo[k]) for (let i = 0; i < p.length; i += 2) pts.push(p[i], p[i + 1]);
  return points.map(s => {
    let best = Infinity, bx = s.at[0], by = s.at[1];
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i] - s.at[0], dy = pts[i + 1] - s.at[1], d = dx * dx + dy * dy;
      if (d < best) { best = d; bx = pts[i]; by = pts[i + 1]; }
    }
    return { ...s, x: bx, y: by };
  });
}

// One sensor's reported rain rate (mm/h) for every minute 0..180, or NaN where a report is missing.
// truth: Float32Array of the storm's rate at the sensor, minute by minute.
export function reports(sensor, truth, seed = 1) {
  const k = KINDS[sensor.kind];
  const r = mulberry32(hash32(sensor.id) ^ (seed * 2654435761));
  const out = new Float32Array(truth.length);
  const calib = 1 + (r() - 0.5) * 0.1;
  const drop = sensor.kind === 'roof' ? 0 : 0.02;
  if (sensor.kind === 'camera') {
    for (let t = 0; t < truth.length; t++) {
      const n = (r() + r() + r() - 1.5) * 0.5;               // about ±25%
      const v = truth[t] * (1 + n);
      out[t] = r() < drop ? NaN : (truth[t] < 2 ? 0 : Math.max(0, Math.round(v / 5) * 5));
    }
  } else {
    let depth = 0; const tips = new Int32Array(truth.length);
    for (let t = 0; t < truth.length; t++) { depth += truth[t] * calib / 60; tips[t] = Math.floor(depth / k.tip); }
    for (let t = 0; t < truth.length; t++) {
      const t0 = Math.max(0, t - k.window);
      const rate = (tips[t] - tips[t0]) * k.tip * 60 / Math.max(1, t - t0);
      out[t] = r() < drop ? NaN : rate;
    }
  }
  // indexed by the minute the rain fell at the sensor; it is known KINDS[kind].latency minutes later
  return out;
}
