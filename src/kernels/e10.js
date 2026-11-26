// E10 Synchronization Garden kernel: the Kuramoto model with the mean-field form, O(N) per step.
//   dθᵢ/dt = ωᵢ + K R sin(ψ − θᵢ) + √(2D) ξᵢ(t),     R e^{iψ} = (1/N) Σⱼ e^{iθⱼ}
// Because R sin(ψ − θᵢ) = S cos θᵢ − C sin θᵢ with C = mean cos θ and S = mean sin θ, the pairwise
// sum collapses to two averages. Heun's method for the drift; the same noise increment in both stages.
// Phases are not wrapped, so a window of phase advance gives each oscillator's observed frequency.
import { makeRng, deriveSeed } from '../core/rng.js';

export const LIMITS = { N: [2, 10000], K: [0, 20], spread: [0, 5], noise: [0, 5], dt: [0.001, 0.2] };
export const DEFAULTS = { N: 1000, K: 3, spread: 1, dist: 'gaussian', init: 'random', noise: 0, dt: 0.05 };
export const INITS = ['random', 'aligned', 'two-camps'];
export const DISTS = ['gaussian', 'lorentzian'];

function checkRange(name, v, [lo, hi], integer = false) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
  if (integer && !Number.isInteger(v)) throw new Error(`${name} must be a whole number`);
}

export function validate(config = {}) {
  const c = { ...DEFAULTS, ...config };
  checkRange('N', c.N, LIMITS.N, true);
  checkRange('K', c.K, LIMITS.K);
  checkRange('spread', c.spread, LIMITS.spread);
  checkRange('noise', c.noise, LIMITS.noise);
  checkRange('dt', c.dt, LIMITS.dt);
  if (!INITS.includes(c.init)) throw new Error(`init must be one of ${INITS.join(', ')}`);
  if (!DISTS.includes(c.dist)) throw new Error(`dist must be one of ${DISTS.join(', ')}`);
  return c;
}

// Inverse of the standard normal CDF (Acklam's rational approximation, relative error < 1.2e-9).
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new Error('p must be between 0 and 1');
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q, r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Natural frequencies: evenly spaced quantiles (i + 1/2)/N of the chosen distribution, shuffled by the seed.
export function naturalFrequencies(N, dist, spread, seed) {
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const p = (i + 0.5) / N;
    w[i] = spread === 0 ? 0 : dist === 'lorentzian' ? spread * Math.tan(Math.PI * (p - 0.5)) : spread * normalQuantile(p);
  }
  const rng = makeRng(deriveSeed(seed, 'e10.omega'));
  for (let i = N - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = w[i];
    w[i] = w[j];
    w[j] = t;
  }
  return w;
}

// Critical coupling for the infinite population: Kc = 2 / (π g(0)).
export function criticalCoupling(dist, spread) {
  if (spread === 0) return 0;
  return dist === 'lorentzian' ? 2 * spread : spread * Math.sqrt(8 / Math.PI);
}

// Order parameter of a phase array.
export function orderParameter(theta) {
  const N = theta.length;
  let C = 0, S = 0;
  for (let i = 0; i < N; i++) {
    C += Math.cos(theta[i]);
    S += Math.sin(theta[i]);
  }
  C /= N;
  S /= N;
  return { R: Math.hypot(C, S), psi: Math.atan2(S, C), C, S };
}

// Drift ωᵢ + K (S cos θᵢ − C sin θᵢ), O(N).
export function meanFieldDrift(theta, omega, K, out = new Float64Array(theta.length)) {
  const { C, S } = orderParameter(theta);
  for (let i = 0; i < theta.length; i++) out[i] = omega[i] + K * (S * Math.cos(theta[i]) - C * Math.sin(theta[i]));
  return out;
}

export function createSim(config = {}, seed = 1) {
  const c = validate(config);
  const { N, dt } = c;
  let { K, noise } = c;
  const omega = config.omega ? Float64Array.from(config.omega) : naturalFrequencies(N, c.dist, c.spread, seed);
  if (omega.length !== N) throw new Error('omega must have N entries');
  const theta = new Float64Array(N);
  const rng0 = makeRng(deriveSeed(seed, 'e10.theta'));
  for (let i = 0; i < N; i++) {
    if (c.init === 'random') theta[i] = 2 * Math.PI * rng0.uniform();
    else if (c.init === 'two-camps') theta[i] = i % 2 === 0 ? 0 : Math.PI;
    else theta[i] = 0;
  }
  const noiseRng = makeRng(deriveSeed(seed, 'e10.noise'));
  const kickRng = makeRng(deriveSeed(seed, 'e10.kick'));
  const f1 = new Float64Array(N);
  const th2 = new Float64Array(N);
  const dW = new Float64Array(N);
  let steps = 0;
  let window = null;
  let ms = 0;
  const sim = {
    config: c,
    seed: seed >>> 0,
    N,
    omega,
    theta,
    get steps() {
      return steps;
    },
    get t() {
      return steps * dt;
    },
    // Change K or the noise strength while running. Same range checks as createSim.
    setParams(p) {
      const m = validate({ ...sim.config, ...p });
      sim.config = m;
      K = m.K;
      noise = m.noise;
    },
    step(n = 1) {
      for (let s = 0; s < n; s++) {
        const sd = Math.sqrt(2 * noise * dt);
        if (noise > 0) for (let i = 0; i < N; i++) dW[i] = sd * noiseRng.normal();
        let C = 0, S = 0;
        for (let i = 0; i < N; i++) {
          C += Math.cos(theta[i]);
          S += Math.sin(theta[i]);
        }
        C /= N;
        S /= N;
        for (let i = 0; i < N; i++) {
          f1[i] = omega[i] + K * (S * Math.cos(theta[i]) - C * Math.sin(theta[i]));
          th2[i] = theta[i] + dt * f1[i] + (noise > 0 ? dW[i] : 0);
        }
        C = 0;
        S = 0;
        for (let i = 0; i < N; i++) {
          C += Math.cos(th2[i]);
          S += Math.sin(th2[i]);
        }
        C /= N;
        S /= N;
        for (let i = 0; i < N; i++) {
          const f2 = omega[i] + K * (S * Math.cos(th2[i]) - C * Math.sin(th2[i]));
          theta[i] += 0.5 * dt * (f1[i] + f2) + (noise > 0 ? dW[i] : 0);
        }
        steps++;
      }
      ms = 0;
      return { ok: true };
    },
    order() {
      return orderParameter(theta);
    },
    // Shift every oscillator within `halfWidth` radians of `angle` by `shift` radians. Returns how many moved.
    kick(angle, halfWidth, shift = Math.PI) {
      let count = 0;
      for (let i = 0; i < N; i++) {
        let d = (theta[i] - angle) % (2 * Math.PI);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        if (Math.abs(d) <= halfWidth) {
          theta[i] += shift;
          count++;
        }
      }
      return count;
    },
    // Shift a seeded random subset (fraction of N) by `shift`. Returns how many moved.
    kickRandom(fraction, shift = Math.PI) {
      let count = 0;
      for (let i = 0; i < N; i++)
        if (kickRng.uniform() < fraction) {
          theta[i] += shift;
          count++;
        }
      return count;
    },
    // Observed frequency of each oscillator: phase advance between beginWindow() and endWindow(), over the elapsed time.
    beginWindow() {
      window = { t0: steps * dt, th0: Float64Array.from(theta) };
    },
    endWindow() {
      if (!window || steps * dt <= window.t0) return null;
      const span = steps * dt - window.t0;
      const freq = new Float64Array(N);
      for (let i = 0; i < N; i++) freq[i] = (theta[i] - window.th0[i]) / span;
      return { freq, span };
    },
    phaseHistogram(bins = 36) {
      const counts = new Array(bins).fill(0);
      for (let i = 0; i < N; i++) {
        let a = theta[i] % (2 * Math.PI);
        if (a < 0) a += 2 * Math.PI;
        counts[Math.min(bins - 1, Math.floor((a / (2 * Math.PI)) * bins))]++;
      }
      return counts;
    },
    diagnostics() {
      const o = orderParameter(theta);
      return { steps, t: steps * dt, R: o.R, psi: o.psi, Kc: criticalCoupling(c.dist, c.spread), floor: 1 / Math.sqrt(N) };
    },
  };
  return sim;
}

// Fraction of oscillators whose observed frequency lies within tol of the population's median observed frequency.
export function lockedFraction(freq, tol) {
  const sorted = Float64Array.from(freq).sort();
  const med = sorted[Math.floor(sorted.length / 2)];
  let n = 0;
  for (let i = 0; i < freq.length; i++) if (Math.abs(freq[i] - med) <= tol) n++;
  return n / freq.length;
}

export const jobs = {};
