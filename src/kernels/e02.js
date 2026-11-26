// E02 The Map of Tomorrow: a seeded fictional watershed and a conservative finite-volume water model.
// Not a validated hydraulic solver. Pure; runs in node, a Worker or the page.

import { makeRng, deriveSeed } from '../core/rng.js';

export const METHOD_VERSION = 'e02-fv-diffusive-1.0.0';
export const SILL_M = 0.25; // basin weir height: storage takes only water deeper than this
export const BOUNDARY_SLOPE = 0.005; // bed slope used for free outflow at the grid edge
export const FROUDE_MAX = 1; // velocity cap as a multiple of √(g·h)

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Seeded value noise in [−1, 1], several octaves.
function noiseField(N, seed, octaves = 4) {
  const out = new Float64Array(N * N);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const rng = makeRng(deriveSeed(seed, 'oct' + o));
    const G = 4 * 2 ** o + 1;
    const lat = new Float64Array(G * G);
    for (let i = 0; i < lat.length; i++) lat[i] = rng.uniform() * 2 - 1;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const gx = (x / (N - 1)) * (G - 1);
        const gy = (y / (N - 1)) * (G - 1);
        const x0 = Math.min(G - 2, Math.floor(gx));
        const y0 = Math.min(G - 2, Math.floor(gy));
        const tx = smooth(gx - x0);
        const ty = smooth(gy - y0);
        const a = lat[y0 * G + x0], b = lat[y0 * G + x0 + 1], c = lat[(y0 + 1) * G + x0], d = lat[(y0 + 1) * G + x0 + 1];
        out[y * N + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

export const ASSET_TYPES = {
  hotel: { label: 'Riverside hotel', threshold_m: 0.2, value_usd: 8e6 },
  farm: { label: 'Rice farm', threshold_m: 0.2, value_usd: 1.2e6 },
  factory: { label: 'Factory', threshold_m: 0.25, value_usd: 15e6 },
  substation: { label: 'Substation', threshold_m: 0.15, value_usd: 5e6 },
};

// Fictional region: terrain z (m), land cover, assets, sensors, inflow and outlet cells.
export function makeRegion(seed, N = 96, cellSize_m = 100) {
  if (!(Number.isInteger(N) && N >= 24 && N <= 160)) throw new Error('Grid must be a whole number from 24 to 160 cells per side.');
  const rng = makeRng(deriveSeed(seed, 'region'));
  const ph1 = rng.range(0, Math.PI * 2), ph2 = rng.range(0, Math.PI * 2);
  const amp1 = rng.range(0.08, 0.14);
  const center = (w) => 0.5 + amp1 * Math.sin(2 * Math.PI * 1.25 * w + ph1) + 0.045 * Math.sin(2 * Math.PI * 3.1 * w + ph2);
  const noise = noiseField(N, deriveSeed(seed, 'terrain'));
  const z = new Float64Array(N * N);
  const urban = new Float64Array(N * N);
  const farm = new Float64Array(N * N);
  const forest = new Float64Array(N * N);
  const channel = new Uint8Array(N * N);
  const outletU = center(1);
  const town = { u: center(0.86) + 0.07, w: 0.86, r: 0.11 };
  for (let y = 0; y < N; y++) {
    const w = y / (N - 1);
    const cl = center(w);
    for (let x = 0; x < N; x++) {
      const u = x / (N - 1);
      const i = y * N + x;
      const du = Math.abs(u - cl);
      let e = 8 + 120 * Math.pow(1 - w, 1.1) + 95 * Math.pow(du, 1.25) + 9 * noise[i];
      const edge = Math.min(u, 1 - u, w);
      e += 55 * Math.pow(Math.max(0, 1 - edge / 0.07), 2);
      const southEdge = Math.max(0, 1 - (1 - w) / 0.07);
      e += 55 * southEdge * southEdge * smooth(Math.min(1, Math.max(0, (Math.abs(u - outletU) - 0.03) / 0.1)));
      const cells = du * (N - 1);
      if (cells < 1.6) {
        e -= 3.2 * (1 - cells / 1.6);
        if (cells < 0.75) channel[i] = 1;
      }
      z[i] = e;
      const dt = Math.hypot(u - town.u, (w - town.w) * 1.2);
      urban[i] = Math.max(0, Math.min(1, (town.r - dt) / 0.035));
      farm[i] = (1 - urban[i]) * Math.max(0, Math.min(1, (0.24 - du) / 0.08)) * smooth(Math.min(1, Math.max(0, (w - 0.18) / 0.15)));
      forest[i] = Math.max(0, 1 - urban[i] - farm[i]);
    }
  }
  const cellAt = (u, w) => {
    const x = Math.max(1, Math.min(N - 2, Math.round(u * (N - 1))));
    const y = Math.max(1, Math.min(N - 2, Math.round(w * (N - 1))));
    return y * N + x;
  };
  const off = 2.2 / (N - 1);
  const assets = [
    { id: 'hotel', ...ASSET_TYPES.hotel, cell: cellAt(center(0.66) + off * 0.7, 0.66) },
    { id: 'farm', ...ASSET_TYPES.farm, cell: cellAt(center(0.47) - off * 1.6, 0.47) },
    { id: 'factory', ...ASSET_TYPES.factory, cell: cellAt(center(0.9) + off * 1.5, 0.9) },
    { id: 'substation', ...ASSET_TYPES.substation, cell: cellAt(center(0.78) - off * 2.4, 0.78) },
  ];
  const sensors = [];
  const srng = makeRng(deriveSeed(seed, 'sensors'));
  for (let k = 0; k < 12; k++) sensors.push(cellAt(srng.range(0.12, 0.88), srng.range(0.1, 0.92)));
  return {
    seed, N, cellSize_m, z, urban, farm, forest, channel, assets, sensors,
    inflowCell: cellAt(center(0), 0),
    outletCell: (N - 1) * N + Math.round(outletU * (N - 1)),
    centerline: Array.from({ length: 33 }, (_, k) => [center(k / 32), k / 32]),
  };
}

// Per-cell parameters for one arm. The intervention arm adds a wetland/retention basin.
export function cellParams(region, p, withIntervention) {
  const { N, urban, farm, forest, channel } = region;
  const n = N * N;
  const infil = new Float64Array(n); // m/s capacity
  const drain = new Float64Array(n); // m/s capacity
  const manning = new Float64Array(n);
  const wet = new Uint8Array(n);
  const paved = p.imperviousness;
  const mm_h = 1 / 1000 / 3600;
  for (let i = 0; i < n; i++) {
    const imperv = urban[i] * paved + (1 - urban[i]) * 0.04;
    const soil = forest[i] * 22 + farm[i] * 11 + urban[i] * 8;
    infil[i] = (1 - imperv) * soil * mm_h;
    drain[i] = urban[i] * p.drainage_mm_h * mm_h;
    manning[i] = channel[i] ? 0.035 : forest[i] * 0.1 + farm[i] * 0.05 + urban[i] * 0.016 + 0.002;
  }
  let wetCells = 0;
  if (withIntervention && p.retentionCapacity_m3 > 0) {
    const cx = p.interventionX * (N - 1), cy = p.interventionY * (N - 1), r = p.interventionRadius_cells;
    const list = [];
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(N - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(N - 1, Math.ceil(cx + r)); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) list.push(y * N + x);
    wetCells = list.length;
    for (const i of list) {
      wet[i] = 1;
      infil[i] += 15 * mm_h;
      manning[i] = Math.max(manning[i], 0.15);
    }
  }
  return { infil, drain, manning, wet, wetCells };
}

export function validateParams(p) {
  const rules = {
    stormIntensity_mm_h: [0, 150], stormDuration_h: [0, 24], inflow_m3_s: [0, 60], retentionCapacity_m3: [0, 2000000],
    imperviousness: [0, 1], drainage_mm_h: [0, 60], interventionX: [0, 1], interventionY: [0, 1],
    interventionRadius_cells: [1, 14], timestep_s: [1, 60], simHours: [2, 48], forcingMultiplier: [0.5, 2],
  };
  for (const [k, [lo, hi]] of Object.entries(rules)) {
    const v = p[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${k} must be between ${lo} and ${hi}.`);
  }
}

// One arm of the simulation. step(k) advances k timesteps; snapshots every 15 simulated minutes.
export function createSim(region, p, withIntervention, opts = {}) {
  validateParams(p);
  const { N, z } = region;
  const n = N * N;
  const A = region.cellSize_m ** 2;
  const dx = region.cellSize_m;
  const dt = p.timestep_s;
  const cp = cellParams(region, p, withIntervention);
  const h = new Float64Array(n);
  const stored = new Float64Array(n);
  const basin = { capacity: withIntervention ? p.retentionCapacity_m3 : 0, stored: 0 }; // m³
  const out4 = new Float64Array(n * 5); // E, W, S, N, boundary
  const k23 = new Float64Array(n);
  const rain = (p.stormIntensity_mm_h * p.forcingMultiplier) / 1000 / 3600; // m/s
  const stormEnd = p.stormDuration_h * 3600;
  const totalSteps = Math.ceil((p.simHours * 3600) / dt);
  const snapEvery = Math.max(1, Math.round(900 / dt));
  const keepSnaps = opts.snapshots !== false;
  const S = {
    step: 0, t: 0, failed: null,
    vIn: 0, vRain: 0, vInflow: 0, vInf: 0, vDrain: 0, vStore: 0, vOut: 0,
    maxCourant: 0, peakQ: 0, peakQ_t: 0, lastQ: 0,
    assets: region.assets.map((a) => ({ id: a.id, label: a.label, threshold_m: a.threshold_m, maxDepth: 0, maxDepth_t: 0, secondsAbove: 0, depth: 0 })),
    maxDepth: 0,
  };
  const series = []; // [t_h, Q_out m3/s, hotel depth m, rain mm/h, surface volume m3]
  const snaps = [];
  function surfaceVolume() {
    let v = 0;
    for (let i = 0; i < n; i++) v += h[i];
    return v * A;
  }
  function record() {
    const hotel = S.assets[0];
    series.push([S.t / 3600, S.lastQ, hotel.depth, S.t < stormEnd ? p.stormIntensity_mm_h * p.forcingMultiplier : 0, surfaceVolume()]);
    if (keepSnaps) snaps.push({ t: S.t, h: Float32Array.from(h) });
  }
  record();

  function oneStep() {
    const r = S.t < stormEnd ? rain * dt : 0;
    if (r > 0) {
      for (let i = 0; i < n; i++) h[i] += r;
      S.vRain += r * A * n;
    }
    if (p.inflow_m3_s > 0) {
      h[region.inflowCell] += (p.inflow_m3_s * dt) / A;
      S.vInflow += p.inflow_m3_s * dt;
    }
    // Losses, each limited by the water present.
    for (let i = 0; i < n; i++) {
      let w = h[i];
      if (w <= 0) continue;
      const inf = Math.min(w, cp.infil[i] * dt);
      w -= inf;
      const dr = Math.min(w, cp.drain[i] * dt);
      w -= dr;
      let st = 0;
      if (cp.wet[i] && w > SILL_M && basin.stored < basin.capacity) {
        // A weir at SILL_M lets ordinary flow pass; water above it spills into one shared basin until full.
        st = Math.min(w - SILL_M, (basin.capacity - basin.stored) / A);
        basin.stored += st * A;
        stored[i] += st;
        w -= st;
      }
      h[i] = w;
      S.vInf += inf * A;
      S.vDrain += dr * A;
      S.vStore += st * A;
    }
    // Conveyance per cell: h^(2/3)/n (Manning), computed once per step.
    for (let i = 0; i < n; i++) k23[i] = h[i] > 1e-9 ? Math.pow(h[i], 2 / 3) / cp.manning[i] : 0;
    // Synchronous fluxes from current state (depth units over one cell area).
    let maxC = 0;
    let maxCCell = -1;
    let qOut = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const o = i * 5;
        out4[o] = out4[o + 1] = out4[o + 2] = out4[o + 3] = out4[o + 4] = 0;
        const hi = h[i];
        if (hi <= 1e-9) continue;
        const Hi = z[i] + hi;
        let tot = 0;
        const nb = [x < N - 1 ? i + 1 : -1, x > 0 ? i - 1 : -1, y < N - 1 ? i + N : -1, y > 0 ? i - N : -1];
        for (let d = 0; d < 5; d++) {
          let dH;
          if (d < 4) {
            const j = nb[d];
            if (j < 0) continue;
            dH = Hi - (z[j] + h[j]);
          } else {
            // Open boundary: an edge cell drains outward at normal depth on a fixed bed slope.
            if (x > 0 && x < N - 1 && y > 0 && y < N - 1) continue;
            dH = Infinity;
          }
          if (dH <= 0) continue;
          let v = k23[i] * Math.sqrt(d < 4 ? dH / dx : BOUNDARY_SLOPE);
          // Froude limiter: flow over a drop cannot exceed critical velocity √(g·h).
          const vc = FROUDE_MAX * Math.sqrt(9.81 * hi);
          if (v > vc) v = vc;
          const c = (v * dt) / dx;
          if (c > maxC) {
            maxC = c;
            maxCCell = i;
          }
          let f = hi * Math.min(1, c);
          if (d < 4 && f > dH / 2) f = dH / 2;
          out4[o + d] = f;
          tot += f;
        }
        if (tot > hi) {
          const s = hi / tot;
          for (let d = 0; d < 5; d++) out4[o + d] *= s;
        }
      }
    }
    if (maxC > S.maxCourant) {
      S.maxCourant = maxC;
      S.maxCourantCell = maxCCell;
      S.maxCourantDepth = h[maxCCell];
    }
    if (maxC > 1) {
      S.failed = `Timestep too large: a cell moved water faster than one cell per step (Courant number ${maxC.toFixed(2)} > 1) at t = ${(S.t / 3600).toFixed(2)} h. Use a smaller timestep.`;
      return false;
    }
    // Apply.
    for (let i = 0; i < n; i++) {
      const o = i * 5;
      const outT = out4[o] + out4[o + 1] + out4[o + 2] + out4[o + 3] + out4[o + 4];
      if (outT === 0) continue;
      h[i] -= outT;
      if (out4[o]) h[i + 1] += out4[o];
      if (out4[o + 1]) h[i - 1] += out4[o + 1];
      if (out4[o + 2]) h[i + N] += out4[o + 2];
      if (out4[o + 3]) h[i - N] += out4[o + 3];
      if (out4[o + 4]) {
        S.vOut += out4[o + 4] * A;
        qOut += (out4[o + 4] * A) / dt;
      }
      if (h[i] < 0) {
        if (h[i] < -1e-9) {
          S.failed = `Negative depth ${h[i].toExponential(2)} m at cell ${i}; the flux limiter failed.`;
          return false;
        }
        h[i] = 0;
      }
    }
    S.step++;
    S.t = S.step * dt;
    S.lastQ = qOut;
    if (qOut > S.peakQ) {
      S.peakQ = qOut;
      S.peakQ_t = S.t;
    }
    for (let k = 0; k < S.assets.length; k++) {
      const a = S.assets[k];
      const d = h[region.assets[k].cell];
      a.depth = d;
      if (d > a.maxDepth) {
        a.maxDepth = d;
        a.maxDepth_t = S.t;
      }
      if (d > a.threshold_m) a.secondsAbove += dt;
    }
    if (S.step % snapEvery === 0 || S.step === totalSteps) {
      let m = 0;
      for (let i = 0; i < n; i++) if (h[i] > m) m = h[i];
      if (m > S.maxDepth) S.maxDepth = m;
      if (!Number.isFinite(m)) {
        S.failed = 'Non-finite depth appeared; the run stopped.';
        return false;
      }
      record();
    }
    return true;
  }

  return {
    region, params: p, arm: withIntervention ? 'intervention' : 'baseline', cp, h, stored, basin, totalSteps, dt,
    get state() {
      return S;
    },
    get done() {
      return S.failed !== null || S.step >= totalSteps;
    },
    step(k = 1) {
      for (let j = 0; j < k && !this.done; j++) if (!oneStep()) break;
      return S;
    },
    runToEnd() {
      while (!this.done) oneStep();
      return S;
    },
    budget() {
      const surface = surfaceVolume();
      S.vIn = S.vRain + S.vInflow;
      const accounted = S.vInf + S.vDrain + S.vStore + S.vOut + surface;
      const residual = S.vIn - accounted;
      return { input: S.vIn, rain: S.vRain, inflow: S.vInflow, infiltrated: S.vInf, drained: S.vDrain, stored: S.vStore, outflow: S.vOut, surface, residual, tolerance: Math.max(1e-6, 0.001 * S.vIn) };
    },
    series,
    snaps,
    surfaceVolume,
  };
}

// Run both arms to the end with identical forcing and summarise. Used by tests, the curve job and reports.
export function runPair(seed, p, N = 96) {
  const region = makeRegion(seed, N);
  const base = createSim(region, p, false, { snapshots: false });
  const alt = createSim(region, p, true, { snapshots: false });
  base.runToEnd();
  alt.runToEnd();
  return { region, base, alt, summary: summarise(base, alt) };
}

export function summarise(base, alt) {
  const s = (sim) => {
    const st = sim.state;
    const b = sim.budget();
    return {
      failed: st.failed,
      hotelPeak_m: st.assets[0].maxDepth,
      hotelHoursAbove: st.assets[0].secondsAbove / 3600,
      assets: st.assets.map((a) => ({ id: a.id, peak_m: a.maxDepth, hoursAbove: a.secondsAbove / 3600, threshold_m: a.threshold_m })),
      peakQ_m3_s: st.peakQ,
      peakQ_h: st.peakQ_t / 3600,
      stored_m3: b.stored,
      infiltrated_m3: b.infiltrated,
      outflow_m3: b.outflow,
      input_m3: b.input,
      residual_m3: b.residual,
      maxCourant: st.maxCourant,
    };
  };
  return { baseline: s(base), intervention: s(alt) };
}

// Storm-size sweep: the depth-at-asset response used by E03 as a synthetic loss driver.
export const CURVE_MULTIPLIERS = [0.4, 0.7, 1.0, 1.3, 1.6];
export function hazardCurve(seed, p, N, progress) {
  const rows = [];
  let k = 0;
  for (const m of CURVE_MULTIPLIERS) {
    const q = { ...p, forcingMultiplier: Math.min(2, Math.max(0.5, p.forcingMultiplier)) };
    q.stormIntensity_mm_h = Math.min(150, p.stormIntensity_mm_h * m);
    const pr = runPair(seed, q, N);
    rows.push({ multiplier: m, stormIntensity_mm_h: q.stormIntensity_mm_h, baseline: pr.summary.baseline, intervention: pr.summary.intervention });
    k++;
    progress && progress(k / CURVE_MULTIPLIERS.length);
  }
  return rows;
}

export const jobs = {
  'e02.pair': ({ seed, params, N }) => runPair(seed, params, N).summary,
  'e02.curve': ({ seed, params, N }, { progress }) => ({ rows: hazardCurve(seed, params, N, progress) }),
};
