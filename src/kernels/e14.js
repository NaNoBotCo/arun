// E14 The River of Air: steady divergence-free flow, RK2 tracers, conservative grid advection-diffusion. Pure functions.
import { makeRng, deriveSeed } from '../core/rng.js';

export const L_KM = 10;
export const MAX_TRACERS = 6000;
export const MAX_SUBSTEPS = 600;
export const COURANT_LIMIT = 0.4;
export const COURANT_UNSAFE = 4;

export const LIMITS = {
  amp: [0, 3], wind_km_h: [0, 12], n_vortices: [0, 4], vortex_strength_km2_h: [0, 12], vortex_radius_km: [0.4, 3],
  meander_km2_h: [0, 8], diffusion_km2_h: [0, 1], source_kg_h: [0, 1000], grid_n: [32, 128], tracer_rate_per_h: [0, 2000],
  receptor_r_km: [0.1, 2],
};

export const DEFAULTS = {
  amp: 1, wind_km_h: 4, n_vortices: 2, vortex_strength_km2_h: 5, vortex_radius_km: 1.2, meander_km2_h: 1.5,
  diffusion_km2_h: 0.05, source_kg_h: 100, grid_n: 96, tracer_rate_per_h: 500, receptor_r_km: 0.6,
  source: [2, 5], receptor: [8, 5], unsafe_courant: false,
};

function check(name, v, [lo, hi], integer = false) {
  if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
  if (integer && !Number.isInteger(v)) throw new Error(`${name} must be a whole number`);
}

export function validate(cfg) {
  for (const k of Object.keys(LIMITS)) check(k, cfg[k], LIMITS[k], k === 'n_vortices' || k === 'grid_n');
  for (const k of ['source', 'receptor']) {
    const p = cfg[k];
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => Number.isFinite(v) && v >= 0 && v <= L_KM)) throw new Error(`${k} must be a point inside 0 to ${L_KM} km`);
  }
}

// psi(x,y) = amp [ U0 y + sum s_i A G_i + w sin(2 pi x / L) sin(pi y / L) ],  u = dpsi/dy, v = -dpsi/dx.
export function makeField(cfg, seed = 0) {
  const rng = makeRng(deriveSeed(seed, 'e14.vortices'));
  const vort = [];
  for (let i = 0; i < cfg.n_vortices; i++) vort.push({ x: rng.range(2, 8), y: rng.range(2, 8), sign: i % 2 === 0 ? 1 : -1 });
  const { amp, wind_km_h: U0, vortex_strength_km2_h: A, vortex_radius_km: s, meander_km2_h: w } = cfg;
  const k1 = (2 * Math.PI) / L_KM, k2 = Math.PI / L_KM, s2 = s * s;
  function parts(x, y) {
    let p = U0 * y, px = 0, py = U0;
    for (const v of vort) {
      const dx = x - v.x, dy = y - v.y;
      const g = v.sign * A * Math.exp(-(dx * dx + dy * dy) / (2 * s2));
      p += g; px += (-dx / s2) * g; py += (-dy / s2) * g;
    }
    const sx = Math.sin(k1 * x), cx = Math.cos(k1 * x), sy = Math.sin(k2 * y), cy = Math.cos(k2 * y);
    p += w * sx * sy; px += w * k1 * cx * sy; py += w * k2 * sx * cy;
    return [p, px, py];
  }
  return {
    vortices: vort,
    psi: (x, y) => amp * parts(x, y)[0],
    vel(x, y) { const q = parts(x, y); return [amp * q[2], -amp * q[1]]; },
  };
}

// Largest |du/dx + dv/dy| on a sample grid, by central differences of the analytic velocity.
export function divergenceMax(field, samples = 25, h = 1e-4) {
  let m = 0;
  for (let a = 0; a < samples; a++)
    for (let b = 0; b < samples; b++) {
      const x = 0.2 + (a / (samples - 1)) * (L_KM - 0.4), y = 0.2 + (b / (samples - 1)) * (L_KM - 0.4);
      const d = (field.vel(x + h, y)[0] - field.vel(x - h, y)[0]) / (2 * h) + (field.vel(x, y + h)[1] - field.vel(x, y - h)[1]) / (2 * h);
      m = Math.max(m, Math.abs(d));
    }
  return m;
}

export function maxSpeed(field, samples = 40) {
  let m = 0;
  for (let a = 0; a < samples; a++) for (let b = 0; b < samples; b++) {
    const v = field.vel((a / (samples - 1)) * L_KM, (b / (samples - 1)) * L_KM);
    m = Math.max(m, Math.hypot(v[0], v[1]));
  }
  return m;
}

// Midpoint (RK2) path of one tracer in a steady field. Returns the end point.
export function traceRK2(field, x, y, T, dt) {
  const n = Math.round(T / dt);
  for (let i = 0; i < n; i++) {
    const [u1, v1] = field.vel(x, y);
    const [u2, v2] = field.vel(x + 0.5 * dt * u1, y + 0.5 * dt * v1);
    x += dt * u2; y += dt * v2;
  }
  return [x, y];
}

export function traceRK4(field, x, y, T, dt) {
  const n = Math.round(T / dt);
  for (let i = 0; i < n; i++) {
    const a = field.vel(x, y), b = field.vel(x + 0.5 * dt * a[0], y + 0.5 * dt * a[1]);
    const c = field.vel(x + 0.5 * dt * b[0], y + 0.5 * dt * b[1]), d = field.vel(x + dt * c[0], y + dt * c[1]);
    x += (dt / 6) * (a[0] + 2 * b[0] + 2 * c[0] + d[0]);
    y += (dt / 6) * (a[1] + 2 * b[1] + 2 * c[1] + d[1]);
  }
  return [x, y];
}

export function ttStats(times) {
  const a = Float64Array.from(times).sort();
  const q = (p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))] : NaN);
  return { n: a.length, median: q(0.5), p10: q(0.1), p90: q(0.9) };
}

const minmod = (a, b) => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b);

export function createSim(cfg, seed = 0) {
  validate(cfg);
  const unsafe = !!cfg.unsafe_courant;
  const n = cfg.grid_n, dx = L_KM / n, area = dx * dx, D = cfg.diffusion_km2_h;
  const field = makeField(cfg, seed);
  // corner streamfunction and exactly divergence-free face fluxes (km^2/h)
  const psi = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) psi[j * (n + 1) + i] = field.psi(i * dx, j * dx);
  const Fx = new Float64Array((n + 1) * n), Fy = new Float64Array(n * (n + 1));
  for (let j = 0; j < n; j++) for (let i = 0; i <= n; i++) Fx[j * (n + 1) + i] = psi[(j + 1) * (n + 1) + i] - psi[j * (n + 1) + i];
  for (let j = 0; j <= n; j++) for (let i = 0; i < n; i++) Fy[j * n + i] = -(psi[j * (n + 1) + i + 1] - psi[j * (n + 1) + i]);
  const outRate = new Float64Array(n * n); // 1/h
  let fmax = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i <= n; i++) {
    const F = Fx[j * (n + 1) + i]; fmax = Math.max(fmax, Math.abs(F));
    if (F > 0 && i >= 1) outRate[j * n + i - 1] += F / area; else if (F < 0 && i < n) outRate[j * n + i] -= F / area;
  }
  for (let j = 0; j <= n; j++) for (let i = 0; i < n; i++) {
    const F = Fy[j * n + i]; fmax = Math.max(fmax, Math.abs(F));
    if (F > 0 && j >= 1) outRate[(j - 1) * n + i] += F / area; else if (F < 0 && j < n) outRate[j * n + i] -= F / area;
  }
  let rateMax = 0;
  for (let c = 0; c < n * n; c++) if (outRate[c] > rateMax) rateMax = outRate[c];
  const C = unsafe ? COURANT_UNSAFE : COURANT_LIMIT;
  let dtMax = rateMax > 0 ? C / rateMax : Infinity;
  if (!unsafe) dtMax = Math.min(dtMax, 0.05);
  else dtMax = Math.min(dtMax, 0.5);
  if (D > 0) dtMax = Math.min(dtMax, (0.9 * area) / (4 * D));
  if (!Number.isFinite(dtMax)) dtMax = 0.05;

  // source footprint (bilinear onto cell centres)
  const srcCells = [];
  {
    const gx = cfg.source[0] / dx - 0.5, gy = cfg.source[1] / dx - 0.5;
    const i0 = Math.max(0, Math.min(n - 2, Math.floor(gx))), j0 = Math.max(0, Math.min(n - 2, Math.floor(gy)));
    const fx = Math.max(0, Math.min(1, gx - i0)), fy = Math.max(0, Math.min(1, gy - j0));
    srcCells.push([j0 * n + i0, (1 - fx) * (1 - fy)], [j0 * n + i0 + 1, fx * (1 - fy)], [(j0 + 1) * n + i0, (1 - fx) * fy], [(j0 + 1) * n + i0 + 1, fx * fy]);
  }
  let Q = cfg.source_kg_h;
  const recCells = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
    if (Math.hypot((i + 0.5) * dx - cfg.receptor[0], (j + 0.5) * dx - cfg.receptor[1]) <= cfg.receptor_r_km) recCells.push(j * n + i);
  if (!recCells.length) {
    recCells.push(Math.min(n - 1, Math.floor(cfg.receptor[1] / dx)) * n + Math.min(n - 1, Math.floor(cfg.receptor[0] / dx)));
  }

  let q = new Float64Array(n * n);
  const q1 = new Float64Array(n * n), dq = new Float64Array(n * n), sx = new Float64Array(n * n), sy = new Float64Array(n * n);
  let t = 0, released = 0, outCum = 0, mass0 = 0, lastOutRate = 0, halted = null, lastSub = 0, lastCourant = 0;
  const massOf = (a) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k]; return s * area; };

  function tendency(a, out) {
    for (let j = 0; j < n; j++) for (let i = 1; i < n - 1; i++) sx[j * n + i] = minmod(a[j * n + i] - a[j * n + i - 1], a[j * n + i + 1] - a[j * n + i]);
    for (let j = 1; j < n - 1; j++) for (let i = 0; i < n; i++) sy[j * n + i] = minmod(a[j * n + i] - a[(j - 1) * n + i], a[(j + 1) * n + i] - a[j * n + i]);
    for (let j = 0; j < n; j++) { sx[j * n] = 0; sx[j * n + n - 1] = 0; }
    for (let i = 0; i < n; i++) { sy[i] = 0; sy[(n - 1) * n + i] = 0; }
    dq.fill(0);
    let o = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i <= n; i++) {
      const F = Fx[j * (n + 1) + i];
      let flux = 0;
      if (i === 0) { if (F < 0) { flux = F * a[j * n]; o -= flux; } }
      else if (i === n) { if (F > 0) { flux = F * a[j * n + n - 1]; o += flux; } }
      else {
        const l = j * n + i - 1, r = l + 1;
        flux = (F >= 0 ? F * (a[l] + 0.5 * sx[l]) : F * (a[r] - 0.5 * sx[r])) - D * (a[r] - a[l]);
      }
      if (i > 0) dq[j * n + i - 1] -= flux;
      if (i < n) dq[j * n + i] += flux;
    }
    for (let j = 0; j <= n; j++) for (let i = 0; i < n; i++) {
      const F = Fy[j * n + i];
      let flux = 0;
      if (j === 0) { if (F < 0) { flux = F * a[i]; o -= flux; } }
      else if (j === n) { if (F > 0) { flux = F * a[(n - 1) * n + i]; o += flux; } }
      else {
        const l = (j - 1) * n + i, r = l + n;
        flux = (F >= 0 ? F * (a[l] + 0.5 * sy[l]) : F * (a[r] - 0.5 * sy[r])) - D * (a[r] - a[l]);
      }
      if (j > 0) dq[(j - 1) * n + i] -= flux;
      if (j < n) dq[j * n + i] += flux;
    }
    for (let c = 0; c < n * n; c++) dq[c] /= area;
    for (const [c, w] of srcCells) dq[c] += (Q * w) / area;
    out.rate = o;
  }

  // tracers
  const px = new Float64Array(MAX_TRACERS), py = new Float64Array(MAX_TRACERS), rel = new Float64Array(MAX_TRACERS);
  const arr = new Float64Array(MAX_TRACERS).fill(NaN), alive = new Uint8Array(MAX_TRACERS);
  let nt = 0, acc = 0, nArrived = 0;
  const rngRelease = makeRng(deriveSeed(seed, 'e14.release'));
  const rngWalk = makeRng(deriveSeed(seed, 'e14.walk'));
  const spread = 0.5 * dx;
  function spawn(x, y) {
    if (nt >= MAX_TRACERS) return false;
    px[nt] = x; py[nt] = y; rel[nt] = t; alive[nt] = 1; nt++;
    return true;
  }
  function moveTracers(dt) {
    const sd = Math.sqrt(2 * D * dt);
    const rx = cfg.receptor[0], ry = cfg.receptor[1], rr = cfg.receptor_r_km;
    for (let k = 0; k < nt; k++) {
      if (!alive[k]) continue;
      let x = px[k], y = py[k];
      const [u1, v1] = field.vel(x, y);
      const [u2, v2] = field.vel(x + 0.5 * dt * u1, y + 0.5 * dt * v1);
      x += dt * u2; y += dt * v2;
      if (sd > 0) { x += sd * rngWalk.normal(); y += sd * rngWalk.normal(); }
      if (x < 0 || x > L_KM || y < 0 || y > L_KM) { alive[k] = 0; px[k] = x; py[k] = y; continue; }
      px[k] = x; py[k] = y;
      if (Number.isNaN(arr[k]) && Math.hypot(x - rx, y - ry) <= rr) { arr[k] = t + dt - rel[k]; nArrived++; }
    }
  }

  const history = [];
  function record() {
    let rc = 0;
    for (const c of recCells) rc += q[c];
    history.push({ t, mass: massOf(q), released, out: outCum, flux: lastOutRate, receptor: rc / recCells.length });
    if (history.length > 3000) history.splice(1, 1);
  }

  function substep(dt) {
    const o0 = {}, o1 = {};
    tendency(q, o0);
    for (let c = 0; c < n * n; c++) q1[c] = q[c] + dt * dq[c];
    tendency(q1, o1);
    for (let c = 0; c < n * n; c++) q[c] = 0.5 * q[c] + 0.5 * (q1[c] + dt * dq[c]);
    outCum += 0.5 * dt * (o0.rate + o1.rate);
    lastOutRate = o1.rate;
    released += Q * dt;
    if (cfg.tracer_rate_per_h > 0 && Q > 0) {
      acc += cfg.tracer_rate_per_h * dt;
      while (acc >= 1) {
        acc -= 1;
        spawn(cfg.source[0] + spread * rngRelease.normal(), cfg.source[1] + spread * rngRelease.normal());
      }
    }
    moveTracers(dt);
    t += dt;
  }

  function budgetResidual() { return massOf(q) + outCum - released - mass0; }

  function health() {
    let mn = Infinity, mx = 0;
    for (let c = 0; c < n * n; c++) {
      const v = q[c];
      if (!Number.isFinite(v)) return 'a concentration became not finite';
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (mn < -1e-9 * Math.max(mx, 1e-12) - 1e-12) return `concentration went negative (${mn.toExponential(2)} kg/km2): the Courant number ${(rateMax * (lastDt || 0)).toFixed(2)} is above the stable limit`;
    const res = Math.abs(budgetResidual()), tol = 1e-8 * Math.max(1, released + mass0);
    if (res > tol) return `mass budget residual ${res.toExponential(2)} kg exceeds ${tol.toExponential(2)} kg`;
    return null;
  }
  let lastDt = 0;

  const sim = {
    cfg, field, n, dx, dtMax, unsafe,
    get halted() { return halted; },
    get t() { return t; },
    // Advance by dtFrame hours in stable substeps. Halts and says why when it cannot.
    step(dtFrame) {
      if (halted) return false;
      if (!(dtFrame > 0)) return true;
      const ns = Math.ceil(dtFrame / dtMax - 1e-12);
      if (ns > MAX_SUBSTEPS) {
        halted = `this step needs ${ns} substeps of ${dtMax.toExponential(2)} h, above the cap of ${MAX_SUBSTEPS}; lower the wind, amplitude or diffusion`;
        return false;
      }
      const dt = dtFrame / ns;
      lastDt = dt; lastSub = ns; lastCourant = rateMax * dt;
      for (let s = 0; s < ns; s++) {
        substep(dt);
        const bad = health();
        if (bad) { halted = bad; record(); return false; }
      }
      record();
      return true;
    },
    // initial blob of scalar (kg total) and, optionally, tracers drawn around the same point
    setBlob(x, y, sigma, massKg) {
      let s = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const v = Math.exp(-(((i + 0.5) * dx - x) ** 2 + ((j + 0.5) * dx - y) ** 2) / (2 * sigma * sigma));
        q[j * n + i] = v; s += v;
      }
      const f = massKg / (s * area);
      for (let c = 0; c < n * n; c++) q[c] *= f;
      mass0 = massOf(q);
    },
    addTracers(count, x, y, sigma) {
      for (let i = 0; i < count; i++) spawn(x + sigma * rngRelease.normal(), y + sigma * rngRelease.normal());
    },
    setSource(kgPerH) { Q = kgPerH; },
    snapshot() { return { t, q, n, px, py, rel, arr, alive, nt, history }; },
    diagnostics() {
      const m = massOf(q);
      let rc = 0;
      for (const c of recCells) rc += q[c];
      const tt = ttStats(Array.from(arr.subarray(0, nt)).filter((v) => Number.isFinite(v)));
      return {
        t, mass_kg: m, released_kg: released, initial_kg: mass0, out_kg: outCum, residual_kg: budgetResidual(),
        retention: released + mass0 > 0 ? m / (released + mass0) : NaN, outflow_kg_h: lastOutRate,
        receptor_kg_km2: rc / recCells.length, tracers: nt, arrived: nArrived,
        arrivedFraction: nt ? nArrived / nt : NaN, tt, substeps: lastSub, courant: lastCourant, courantLimit: C,
        dt_h: lastDt, dtMax_h: dtMax, maxSpeed_km_h: (fmax / dx), halted,
      };
    },
    meanTracer() {
      let sxm = 0, sym = 0, c = 0, vx = 0, vy = 0;
      for (let k = 0; k < nt; k++) if (alive[k]) { sxm += px[k]; sym += py[k]; c++; }
      if (!c) return null;
      sxm /= c; sym /= c;
      for (let k = 0; k < nt; k++) if (alive[k]) { vx += (px[k] - sxm) ** 2; vy += (py[k] - sym) ** 2; }
      return { x: sxm, y: sym, varx: vx / c, vary: vy / c, count: c };
    },
    gridMoments() {
      let m = 0, mx = 0, my = 0, vx = 0, vy = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = q[j * n + i]; m += v; mx += v * (i + 0.5) * dx; my += v * (j + 0.5) * dx; }
      mx /= m; my /= m;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = q[j * n + i]; vx += v * ((i + 0.5) * dx - mx) ** 2; vy += v * ((j + 0.5) * dx - my) ** 2; }
      return { x: mx, y: my, varx: vx / m, vary: vy / m };
    },
    cellDivergenceMax() {
      let mx = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const d = Fx[j * (n + 1) + i + 1] - Fx[j * (n + 1) + i] + Fy[(j + 1) * n + i] - Fy[j * n + i];
        mx = Math.max(mx, Math.abs(d));
      }
      return mx;
    },
  };
  record();
  return sim;
}

// A few seeded streamlines for drawing: RK2 polylines in both directions from seeded points.
export function streamlines(field, seed, count = 90, steps = 140) {
  const rng = makeRng(deriveSeed(seed, 'e14.stream'));
  const lines = [];
  for (let k = 0; k < count; k++) {
    const x0 = rng.range(0, L_KM), y0 = rng.range(0, L_KM);
    const line = [];
    for (const dir of [1, -1]) {
      let x = x0, y = y0;
      const part = [];
      for (let i = 0; i < steps; i++) {
        const [u, v] = field.vel(x, y);
        const sp = Math.hypot(u, v);
        if (sp < 1e-9) break;
        const h = (0.08 * dir) / sp;
        const [u2, v2] = field.vel(x + 0.5 * h * u, y + 0.5 * h * v);
        const s2 = Math.hypot(u2, v2) || 1;
        x += (0.08 * dir * u2) / s2; y += (0.08 * dir * v2) / s2;
        if (x < 0 || x > L_KM || y < 0 || y > L_KM) break;
        part.push([x, y]);
      }
      if (dir === 1) line.push(...part); else line.unshift(...part.reverse());
    }
    if (line.length > 4) lines.push(line);
  }
  return lines;
}

export const jobs = {};
