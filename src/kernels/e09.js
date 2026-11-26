// E09 Butterfly Chamber kernel: the Lorenz system integrated with classical RK4, two copies a small distance apart.
//   dx/dt = σ (y − x)    dy/dt = x (ρ − z) − y    dz/dt = x y − β z
// Pure maths, no DOM. The second copy starts at the first plus a seeded direction times eps.
import { makeRng, deriveSeed } from '../core/rng.js';

export const LIMITS = { sigma: [0.1, 50], rho: [0, 200], beta: [0.1, 10], dt: [1e-4, 0.05], eps: [0, 1] };
export const DEFAULTS = { sigma: 10, rho: 28, beta: 8 / 3, dt: 0.005, eps: 1e-8 };
export const BLOWUP = 1e6;

function checkRange(name, v, [lo, hi]) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
}

export function validate(config = {}) {
  const c = { ...DEFAULTS, ...config };
  checkRange('sigma', c.sigma, LIMITS.sigma);
  checkRange('rho', c.rho, LIMITS.rho);
  checkRange('beta', c.beta, LIMITS.beta);
  checkRange('dt', c.dt, LIMITS.dt);
  checkRange('eps', c.eps, LIMITS.eps);
  return c;
}

export function rhs(s, p, out = [0, 0, 0]) {
  out[0] = p.sigma * (s[1] - s[0]);
  out[1] = s[0] * (p.rho - s[2]) - s[1];
  out[2] = s[0] * s[1] - p.beta * s[2];
  return out;
}

// One RK4 step. Writes the new state into `s` in place.
const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0], tmp = [0, 0, 0];
export function rk4(s, p, dt) {
  rhs(s, p, k1);
  for (let i = 0; i < 3; i++) tmp[i] = s[i] + 0.5 * dt * k1[i];
  rhs(tmp, p, k2);
  for (let i = 0; i < 3; i++) tmp[i] = s[i] + 0.5 * dt * k2[i];
  rhs(tmp, p, k3);
  for (let i = 0; i < 3; i++) tmp[i] = s[i] + dt * k3[i];
  rhs(tmp, p, k4);
  for (let i = 0; i < 3; i++) s[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return s;
}

export function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function unitDirection(rng) {
  const d = [rng.normal(), rng.normal(), rng.normal()];
  const n = Math.hypot(d[0], d[1], d[2]) || 1;
  return d.map((x) => x / n);
}

// Start point: random near the attractor's usual range, drawn from the seed.
export function initialState(seed) {
  const rng = makeRng(deriveSeed(seed, 'e09.x0'));
  return [rng.range(-10, 10), rng.range(-10, 10), rng.range(10, 35)];
}

export function createPair(config = {}, seed = 1) {
  const c = validate(config);
  const a = config.x0 ? config.x0.slice() : initialState(seed);
  const dir = unitDirection(makeRng(deriveSeed(seed, 'e09.dir')));
  const b = a.map((x, i) => x + c.eps * dir[i]);
  const nudgeRng = makeRng(deriveSeed(seed, 'e09.nudge'));
  let steps = 0;
  let failed = null;
  // Running mean and spread of A along its path: sets the saturation scale of the separation.
  const m = [0, 0, 0], m2 = [0, 0, 0];
  let cnt = 0;
  const accumulate = () => {
    cnt++;
    for (let i = 0; i < 3; i++) {
      const d = a[i] - m[i];
      m[i] += d / cnt;
      m2[i] += d * (a[i] - m[i]);
    }
  };
  const pair = {
    config: c,
    seed: seed >>> 0,
    direction: dir,
    get t() {
      return steps * c.dt;
    },
    get steps() {
      return steps;
    },
    get failed() {
      return failed;
    },
    a,
    b,
    step(n = 1) {
      if (failed) return { ok: false, reason: failed };
      for (let i = 0; i < n; i++) {
        rk4(a, c, c.dt);
        rk4(b, c, c.dt);
        steps++;
        accumulate();
        if (!(Math.abs(a[0]) < BLOWUP && Math.abs(a[1]) < BLOWUP && Math.abs(a[2]) < BLOWUP && Math.abs(b[0]) < BLOWUP && Math.abs(b[1]) < BLOWUP && Math.abs(b[2]) < BLOWUP)) {
          failed = `The state left ±${BLOWUP} at step ${steps}; the step is too large for these parameters.`;
          return { ok: false, reason: failed };
        }
      }
      return { ok: true };
    },
    separation() {
      return distance(a, b);
    },
    // Kick system B by `size` in a seeded direction.
    nudgeB(size) {
      const d = unitDirection(nudgeRng);
      for (let i = 0; i < 3; i++) b[i] += size * d[i];
      return d;
    },
    // Distance two independent points of the attractor would have: sqrt(2 · trace of the covariance of A's path).
    saturation() {
      if (cnt < 2) return NaN;
      return Math.sqrt((2 * (m2[0] + m2[1] + m2[2])) / (cnt - 1));
    },
    diagnostics() {
      return { steps, t: steps * c.dt, separation: distance(a, b), saturation: pair.saturation(), failed };
    },
  };
  return pair;
}

// Benettin's procedure for the largest Lyapunov exponent: follow a reference and a copy at distance d0,
// every `renormEvery` steps add ln(d/d0) to a sum and pull the copy back to distance d0 along the same
// direction. λ = sum / elapsed time. The first `transient` time units are run first and not counted.
export function lyapunovEstimate(params, { T = 100, transient = 10, d0 = 1e-8, renormEvery = 50 } = {}, seed = 1) {
  const c = validate({ ...params, eps: d0 });
  const a = initialState(seed);
  const dir = unitDirection(makeRng(deriveSeed(seed, 'e09.lyap')));
  const nT = Math.round(transient / c.dt);
  for (let i = 0; i < nT; i++) rk4(a, c, c.dt);
  const b = a.map((x, i) => x + d0 * dir[i]);
  const nSteps = Math.round(T / c.dt);
  let sum = 0;
  let counted = 0;
  for (let i = 1; i <= nSteps; i++) {
    rk4(a, c, c.dt);
    rk4(b, c, c.dt);
    if (i % renormEvery === 0) {
      const d = distance(a, b);
      if (!(d > 0) || !Number.isFinite(d)) throw new Error('Separation collapsed to zero or became non-finite');
      sum += Math.log(d / d0);
      counted++;
      for (let j = 0; j < 3; j++) b[j] = a[j] + (d0 / d) * (b[j] - a[j]);
    }
  }
  const elapsed = counted * renormEvery * c.dt;
  return { lambda: sum / elapsed, T: elapsed, d0, renormEvery, dt: c.dt };
}

// Least-squares slope of ln d against t over the points where d0·factor ≤ d ≤ saturation·frac.
export function growthFit(ts, ds, { dMin, dMax }) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < ts.length; i++) {
    const d = ds[i];
    if (!(d >= dMin && d <= dMax)) continue;
    const y = Math.log(d);
    n++;
    sx += ts[i];
    sy += y;
    sxx += ts[i] * ts[i];
    sxy += ts[i] * y;
  }
  if (n < 3) return { slope: NaN, n };
  const den = n * sxx - sx * sx;
  if (den === 0) return { slope: NaN, n };
  return { slope: (n * sxy - sx * sy) / den, n };
}

export const jobs = {
  'e09.lyapunov': (payload, { progress }) => {
    const out = lyapunovEstimate(payload.params, payload.options || {}, payload.seed ?? 1);
    progress && progress(1);
    return out;
  },
};
