// E11 Temporal Symmetry Lab kernel. Pure maths, no DOM.
//   Part A  a forced subharmonic toy: drive cos(2πt/T), response cos(2πt/(mT) + φ). Frequency division only.
//   Part B  a classical driven Duffing oscillator  x'' + γ x' + ω0² x + α x³ = F cos(Ω t)  (RK4, strobed at the drive period)
//           and the logistic map  x(n+1) = r x(n) (1 − x(n)).
// Nothing here is a time crystal. A time crystal needs a many-body system that breaks a time-translation symmetry on its own.
import { makeRng, deriveSeed } from '../core/rng.js';

function checkRange(name, v, lo, hi, integer = false) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
  if (integer && !Number.isInteger(v)) throw new Error(`${name} must be a whole number`);
}

// ---------- Fourier ----------

// Naive O(n²) discrete Fourier transform. The reference for the FFT.
export function dft(x) {
  const n = x.length;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let a = 0, b = 0;
    for (let j = 0; j < n; j++) {
      const ang = (-2 * Math.PI * ((k * j) % n)) / n;
      a += x[j] * Math.cos(ang);
      b += x[j] * Math.sin(ang);
    }
    re[k] = a;
    im[k] = b;
  }
  return { re, im };
}

// Radix-2 FFT of a real series (length a power of two).
export function fft(x) {
  const n = x.length;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT length must be a power of two');
  const re = Float64Array.from(x), im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const t = re[i];
      re[i] = re[j];
      re[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  return { re, im };
}

// One-sided amplitude spectrum with a Hann window, scaled so a bin-centred cosine of amplitude A reads A.
// freq is in cycles per time unit; dt is the sample spacing.
export function amplitudeSpectrum(x, dt) {
  const n = x.length;
  const w = new Float64Array(n);
  let sw = 0;
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    sw += w[i];
  }
  const { re, im } = fft(x.map ? Float64Array.from(x, (v, i) => v * w[i]) : x);
  const m = n / 2;
  const freq = new Float64Array(m), amp = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    freq[k] = k / (n * dt);
    amp[k] = (2 * Math.hypot(re[k], im[k])) / sw;
  }
  return { freq, amp };
}

export function spectralPeak(spec, minFreq = 0) {
  let best = -1;
  for (let k = 1; k < spec.amp.length; k++) if (spec.freq[k] >= minFreq && (best < 0 || spec.amp[k] > spec.amp[best])) best = k;
  return best < 0 ? { freq: NaN, amp: 0, bin: -1 } : { freq: spec.freq[best], amp: spec.amp[best], bin: best };
}

// ---------- Part A: the subharmonic toy ----------

export const TOY_LIMITS = { T: [0.1, 10], m: [1, 8], phase_rad: [-Math.PI, Math.PI], noise: [0, 1], kickAt_periods: [0, 1e6], kick_rad: [-Math.PI, Math.PI] };
export const TOY_DEFAULTS = { T: 1, m: 2, phase_rad: 0, noise: 0, kickAt_periods: -1, kick_rad: Math.PI, nPeriods: 64, perPeriod: 32 };

export function subharmonicToy(config = {}, seed = 1) {
  const c = { ...TOY_DEFAULTS, ...config };
  checkRange('T', c.T, ...TOY_LIMITS.T);
  checkRange('m', c.m, ...TOY_LIMITS.m, true);
  checkRange('phase', c.phase_rad, ...TOY_LIMITS.phase_rad);
  checkRange('noise', c.noise, ...TOY_LIMITS.noise);
  checkRange('kick', c.kick_rad, ...TOY_LIMITS.kick_rad);
  if (![32, 64, 128, 256].includes(c.nPeriods)) throw new Error('nPeriods must be 32, 64, 128 or 256');
  if (![8, 16, 32, 64].includes(c.perPeriod)) throw new Error('perPeriod must be 8, 16, 32 or 64');
  const rng = makeRng(deriveSeed(seed, 'e11.toy'));
  const n = c.nPeriods * c.perPeriod;
  const dt = c.T / c.perPeriod;
  const t = new Float64Array(n), drive = new Float64Array(n), response = new Float64Array(n);
  const kickT = c.kickAt_periods >= 0 ? c.kickAt_periods * c.T : Infinity;
  for (let j = 0; j < n; j++) {
    t[j] = j * dt;
    drive[j] = Math.cos((2 * Math.PI * t[j]) / c.T);
    const ph = c.phase_rad + (t[j] >= kickT ? c.kick_rad : 0);
    response[j] = Math.cos((2 * Math.PI * t[j]) / (c.m * c.T) + ph) + (c.noise > 0 ? c.noise * rng.normal() : 0);
  }
  const strobe = new Float64Array(c.nPeriods);
  for (let q = 0; q < c.nPeriods; q++) strobe[q] = response[q * c.perPeriod];
  const spR = amplitudeSpectrum(response, dt);
  const spD = amplitudeSpectrum(drive, dt);
  const fDrive = 1 / c.T;
  const peak = spectralPeak(spR, fDrive / (c.m + 1) / 4);
  return { config: c, dt, t, drive, response, strobe, spectrumResponse: spR, spectrumDrive: spD, peak, mEstimate: peak.freq > 0 ? fDrive / peak.freq : NaN, fDrive };
}

// Smallest p (1..maxP) such that seq[i] ≈ seq[i+p] for the last `window` entries, else 0.
export function periodOf(seq, { tol = 1e-3, maxP = 16, window = 24, skip = 0 } = {}) {
  const n = seq.length;
  for (let p = 1; p <= maxP; p++) {
    let ok = true;
    const lo = Math.max(skip, n - window);
    if (n - p <= lo) break;
    for (let i = lo; i < n - p; i++)
      if (Math.abs(seq[i] - seq[i + p]) > tol) {
        ok = false;
        break;
      }
    if (ok) return p;
  }
  return 0;
}

// ---------- Part B: the Duffing oscillator ----------

export const DUFF_LIMITS = { gamma: [0, 2], omega0: [0, 3], alpha: [-2, 5], F: [0, 30], Omega: [0.2, 5], x0: [-5, 5], stepsPerPeriod: [50, 800], nTransient: [0, 2000], nSample: [1, 2000] };
export const DUFF_DEFAULTS = { gamma: 0.1, omega0: 0, alpha: 1, F: 5, Omega: 1, stepsPerPeriod: 200, nTransient: 150, nSample: 80, traceMax: 6000 };

function duffValidate(p) {
  const c = { ...DUFF_DEFAULTS, ...p };
  for (const k of ['gamma', 'omega0', 'alpha', 'F', 'Omega']) checkRange(k, c[k], ...DUFF_LIMITS[k]);
  checkRange('stepsPerPeriod', c.stepsPerPeriod, ...DUFF_LIMITS.stepsPerPeriod, true);
  checkRange('nTransient', c.nTransient, ...DUFF_LIMITS.nTransient, true);
  checkRange('nSample', c.nSample, ...DUFF_LIMITS.nSample, true);
  return c;
}

// Advance one drive period from (x, v, t0) with RK4 in `steps` steps; writes the state in place.
function duffPeriod(s, t0, c, trace, traceAt) {
  const T = (2 * Math.PI) / c.Omega;
  const h = T / c.stepsPerPeriod;
  const w2 = c.omega0 * c.omega0;
  const f = (x, v, t) => -c.gamma * v - w2 * x - c.alpha * x * x * x + c.F * Math.cos(c.Omega * t);
  let x = s[0], v = s[1];
  for (let i = 0; i < c.stepsPerPeriod; i++) {
    const t = t0 + i * h;
    if (trace) trace[traceAt + i] = x;
    const k1x = v, k1v = f(x, v, t);
    const k2x = v + 0.5 * h * k1v, k2v = f(x + 0.5 * h * k1x, v + 0.5 * h * k1v, t + 0.5 * h);
    const k3x = v + 0.5 * h * k2v, k3v = f(x + 0.5 * h * k2x, v + 0.5 * h * k2v, t + 0.5 * h);
    const k4x = v + h * k3v, k4v = f(x + h * k3x, v + h * k3v, t + h);
    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  s[0] = x;
  s[1] = v;
  return T;
}

// Run nTransient + nSample drive periods. Strobe samples (x, v) at t = n·T for every n.
export function duffingRun(params = {}, seed = 1, state0 = null) {
  const c = duffValidate(params);
  const rng = makeRng(deriveSeed(seed, 'e11.duff'));
  const s = state0 ? state0.slice() : [rng.range(-0.5, 0.5), rng.range(-0.5, 0.5)];
  const total = c.nTransient + c.nSample;
  const xs = new Float64Array(total), vs = new Float64Array(total);
  const S = c.stepsPerPeriod;
  const tracePeriods = Math.min(total, Math.max(2, Math.floor(c.traceMax / S)));
  const trace = new Float64Array(tracePeriods * S);
  let t = 0;
  for (let n = 0; n < total; n++) {
    xs[n] = s[0];
    vs[n] = s[1];
    const inTrace = n >= total - tracePeriods;
    t += duffPeriod(s, t, c, inTrace ? trace : null, (n - (total - tracePeriods)) * S);
    if (!(Math.abs(s[0]) < 1e6 && Math.abs(s[1]) < 1e6)) {
      return { ok: false, reason: `The oscillator left ±1e6 at drive period ${n + 1}.`, config: c, strobeX: xs.slice(0, n + 1), strobeV: vs.slice(0, n + 1) };
    }
  }
  const steadyX = xs.slice(c.nTransient);
  const period = periodOf(steadyX, { tol: 1e-4 * (1 + Math.max(...steadyX.map(Math.abs))), maxP: 16, window: Math.min(48, steadyX.length) });
  return { ok: true, config: c, strobeX: xs, strobeV: vs, trace, tracePeriods, final: s, period, nTransient: c.nTransient };
}

// Bifurcation sweep over F with continuation: each F starts from the previous final state.
export function duffingBifurcation(params = {}, { fMin = 1, fMax = 9, nF = 120, nKeep = 40, nTransient = 120, stepsPerPeriod = 80 } = {}, seed = 1, onProgress) {
  checkRange('nF', nF, 2, 2000, true);
  checkRange('nKeep', nKeep, 1, 400, true);
  const F = new Float64Array(nF), x = new Float64Array(nF * nKeep), per = new Int32Array(nF);
  let state = null;
  for (let i = 0; i < nF; i++) {
    F[i] = fMin + ((fMax - fMin) * i) / (nF - 1);
    const r = duffingRun({ ...params, F: F[i], nTransient: i === 0 ? nTransient * 2 : nTransient, nSample: nKeep, stepsPerPeriod }, seed, state);
    if (!r.ok) {
      for (let j = 0; j < nKeep; j++) x[i * nKeep + j] = NaN;
      per[i] = -1;
      state = null;
      continue;
    }
    state = r.final;
    for (let j = 0; j < nKeep; j++) x[i * nKeep + j] = r.strobeX[r.nTransient + j];
    per[i] = r.period;
    if (onProgress && i % 4 === 0) onProgress((i + 1) / nF);
  }
  return { F, x, nKeep, period: per };
}

// Robustness to a small kick: run to steady state, record the strobe set, kick x by `kick`, see where it settles.
export function duffingRobustness(params = {}, { kick = 0.01, nAfter = 120 } = {}, seed = 1) {
  const base = duffingRun({ ...params, nSample: 48 }, seed);
  if (!base.ok) return { ok: false, reason: base.reason };
  const p = base.period;
  const set = Array.from(base.strobeX.slice(base.nTransient, base.nTransient + 48));
  const after = duffingRun({ ...params, nTransient: 0, nSample: nAfter }, seed, [base.final[0] + kick, base.final[1]]);
  if (!after.ok) return { ok: false, reason: after.reason };
  const dist = (xv) => Math.min(...set.map((s) => Math.abs(s - xv)));
  const tol = 1e-3 * (1 + Math.max(...set.map(Math.abs)));
  let back = -1;
  for (let n = 0; n < nAfter; n++)
    if (dist(after.strobeX[n]) < tol) {
      let stay = true;
      for (let q = n; q < Math.min(nAfter, n + 12); q++) if (dist(after.strobeX[q]) >= tol) stay = false;
      if (stay) {
        back = n;
        break;
      }
    }
  const periodAfter = periodOf(after.strobeX.slice(60), { tol, maxP: 16, window: Math.min(48, nAfter - 60) });
  return { ok: true, periodBefore: p, periodAfter, returned: back >= 0, periodsToReturn: back, kick };
}

// ---------- Part B: the logistic map ----------

export function logisticOrbit(r, x0, n) {
  checkRange('r', r, 0, 4);
  checkRange('x0', x0, 0, 1);
  const out = new Float64Array(n);
  let x = x0;
  for (let i = 0; i < n; i++) {
    out[i] = x;
    x = r * x * (1 - x);
  }
  return out;
}

export function logisticStart(seed) {
  return makeRng(deriveSeed(seed, 'e11.logistic')).range(0.1, 0.9);
}

export function logisticPeriod(r, x0 = 0.4, { nTransient = 4000, maxP = 64, tol = 1e-7 } = {}) {
  const orbit = logisticOrbit(r, x0, nTransient + 256);
  return periodOf(orbit.slice(nTransient), { tol, maxP, window: 128 });
}

export function logisticLyapunov(r, x0 = 0.4, n = 20000, nTransient = 500) {
  let x = x0, s = 0;
  for (let i = 0; i < nTransient; i++) x = r * x * (1 - x);
  for (let i = 0; i < n; i++) {
    s += Math.log(Math.abs(r * (1 - 2 * x)) + 1e-300);
    x = r * x * (1 - x);
  }
  return s / n;
}

export function logisticBifurcation({ rMin = 2.5, rMax = 4, nR = 600, nTransient = 500, nKeep = 60 } = {}, seed = 1, onProgress) {
  checkRange('rMin', rMin, 0, 4);
  checkRange('rMax', rMax, 0, 4);
  checkRange('nR', nR, 2, 4000, true);
  const r = new Float64Array(nR), x = new Float64Array(nR * nKeep), lyap = new Float64Array(nR);
  const x0 = logisticStart(seed);
  for (let i = 0; i < nR; i++) {
    r[i] = rMin + ((rMax - rMin) * i) / (nR - 1);
    let v = x0;
    for (let k = 0; k < nTransient; k++) v = r[i] * v * (1 - v);
    for (let k = 0; k < nKeep; k++) {
      x[i * nKeep + k] = v;
      v = r[i] * v * (1 - v);
    }
    lyap[i] = logisticLyapunov(r[i], x0, 2000, 300);
    if (onProgress && i % 50 === 0) onProgress((i + 1) / nR);
  }
  return { r, x, nKeep, lyap };
}

export const jobs = {
  'e11.duffing-bifurcation': (payload, { progress }) => {
    const out = duffingBifurcation(payload.params, payload.options, payload.seed ?? 1, progress);
    return { F: Array.from(out.F), x: Array.from(out.x), nKeep: out.nKeep, period: Array.from(out.period) };
  },
  'e11.logistic-bifurcation': (payload, { progress }) => {
    const out = logisticBifurcation(payload.options, payload.seed ?? 1, progress);
    return { r: Array.from(out.r), x: Array.from(out.x), nKeep: out.nKeep, lyap: Array.from(out.lyap) };
  },
};
