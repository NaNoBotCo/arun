// E08 Pattern Garden kernel: Gray–Scott reaction–diffusion on a periodic square grid. Pure maths, no DOM.
//   u_t = Du ∇²u − u v² + F (1 − u)
//   v_t = Dv ∇²v + u v² − (F + k) v
// Five-point Laplacian, grid spacing dx = 1, forward Euler in time, periodic boundaries.
import { makeRng, deriveSeed } from '../core/rng.js';

export const LIMITS = {
  N: [16, 256],
  F: [0, 0.12],
  k: [0, 0.12],
  Dv: [0.005, 0.5],
  ratio: [1, 4], // Du / Dv
  dt: [0.01, 4],
  spots: [0, 64],
};
export const DX = 1;
export const BLOWUP = 1e3; // |u| or |v| beyond this counts as numerical blow-up
export const DEFAULTS = { N: 128, F: 0.0367, k: 0.0649, Dv: 0.08, ratio: 2, dt: 1, spots: 8, noise: 0.01 };

function checkRange(name, v, [lo, hi], integer = false) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
  if (integer && !Number.isInteger(v)) throw new Error(`${name} must be a whole number`);
}

export function validate(config) {
  const c = { ...DEFAULTS, ...config };
  checkRange('N', c.N, LIMITS.N, true);
  checkRange('F', c.F, LIMITS.F);
  checkRange('k', c.k, LIMITS.k);
  checkRange('Dv', c.Dv, LIMITS.Dv);
  checkRange('D ratio', c.ratio, LIMITS.ratio);
  checkRange('dt', c.dt, LIMITS.dt);
  checkRange('spots', c.spots, LIMITS.spots, true);
  if (typeof c.noise !== 'number' || !(c.noise >= 0 && c.noise <= 0.1)) throw new Error('noise must be between 0 and 0.1');
  c.Du = c.Du ?? c.ratio * c.Dv;
  if (!(c.Du > 0 && c.Du <= 4)) throw new Error('Du must be between 0 and 4');
  return c;
}

// Diffusion step number D·dt/dx². Forward Euler on the five-point Laplacian needs it ≤ 1/4.
export function stabilityNumber(Du, Dv, dt, dx = DX) {
  return (Math.max(Du, Dv) * dt) / (dx * dx);
}

export function createSim(config = {}, seed = 1) {
  const c = validate(config);
  const { N } = c;
  let { F, k, Du, Dv, dt } = c;
  let time = 0;
  const n2 = N * N;
  let u = new Float64Array(n2).fill(1);
  let v = new Float64Array(n2);
  let un = new Float64Array(n2);
  let vn = new Float64Array(n2);
  const rng = makeRng(deriveSeed(seed, 'e08.init'));
  const half = Math.max(2, Math.round(N / 32));
  let steps = 0;
  let failed = null;
  const sim = {
    config: c,
    seed: seed >>> 0,
    N,
    get steps() {
      return steps;
    },
    get t() {
      return time;
    },
    // Change F, k, ratio, Dv or dt while running. Same validation as createSim. The fields stay as they are.
    setParams(p) {
      const merged = validate({ ...sim.config, Du: undefined, ...p });
      sim.config = merged;
      ({ F, k, Du, Dv, dt } = merged);
      sim.stability = stabilityNumber(Du, Dv, dt);
      return sim.stability;
    },
    get failed() {
      return failed;
    },
    // Square patch u = 1/2, v = 1/4 centred on (cx, cy), wrapping at the edges. Returns cells changed.
    plant(cx, cy, r = half) {
      let count = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = (((Math.round(cx) + dx) % N) + N) % N;
          const y = (((Math.round(cy) + dy) % N) + N) % N;
          u[y * N + x] = 0.5;
          v[y * N + x] = 0.25;
          count++;
        }
      return count;
    },
    stability: stabilityNumber(Du, Dv, dt),
    step(nSteps = 1) {
      if (failed) return { ok: false, reason: failed.reason, step: failed.step };
      for (let s = 0; s < nSteps; s++) {
        let bad = false;
        const FK = F + k;
        for (let y = 0; y < N; y++) {
          const r0 = y * N;
          const rm = ((y + N - 1) % N) * N;
          const rp = ((y + 1) % N) * N;
          for (let x = 0; x < N; x++) {
            const xm = x === 0 ? N - 1 : x - 1;
            const xp = x === N - 1 ? 0 : x + 1;
            const i = r0 + x;
            const uc = u[i];
            const vc = v[i];
            const lu = u[rm + x] + u[rp + x] + u[r0 + xm] + u[r0 + xp] - 4 * uc;
            const lv = v[rm + x] + v[rp + x] + v[r0 + xm] + v[r0 + xp] - 4 * vc;
            const uvv = uc * vc * vc;
            const a = uc + dt * (Du * lu - uvv + F * (1 - uc));
            const b = vc + dt * (Dv * lv + uvv - FK * vc);
            un[i] = a;
            vn[i] = b;
            if (!(a < BLOWUP && a > -BLOWUP && b < BLOWUP && b > -BLOWUP)) bad = true;
          }
        }
        let t1 = u;
        u = un;
        un = t1;
        t1 = v;
        v = vn;
        vn = t1;
        steps++;
        time += dt;
        if (bad) {
          failed = {
            step: steps,
            reason: `The fields left the range ±${BLOWUP} at step ${steps}. The explicit step is too large for this diffusion rate (D·dt/dx² = ${sim.stability.toFixed(3)}, limit 0.25).`,
          };
          return { ok: false, reason: failed.reason, step: steps };
        }
      }
      return { ok: true, step: steps };
    },
    snapshot() {
      return { N, u, v, steps, t: time };
    },
    stats() {
      let su = 0, sv = 0, mnu = Infinity, mxv = -Infinity, mxu = -Infinity, mnv = Infinity;
      for (let i = 0; i < n2; i++) {
        const a = u[i], b = v[i];
        su += a;
        sv += b;
        if (a < mnu) mnu = a;
        if (a > mxu) mxu = a;
        if (b < mnv) mnv = b;
        if (b > mxv) mxv = b;
      }
      const mu = su / n2, mv = sv / n2;
      let vu = 0, vv = 0;
      for (let i = 0; i < n2; i++) {
        vu += (u[i] - mu) ** 2;
        vv += (v[i] - mv) ** 2;
      }
      return { meanU: mu, meanV: mv, varU: vu / n2, varV: vv / n2, minU: mnu, maxU: mxu, minV: mnv, maxV: mxv, finite: Number.isFinite(su + sv) };
    },
    diagnostics() {
      return { steps, t: time, stability: sim.stability, stable: sim.stability <= 0.25, failed: failed ? failed.reason : null };
    },
  };
  // Seeded initial perturbations: random patches, each with a little seeded noise on top.
  for (let s = 0; s < c.spots; s++) {
    const cx = rng.int(N);
    const cy = rng.int(N);
    sim.plant(cx, cy, half);
    if (c.noise > 0)
      for (let dy = -half; dy <= half; dy++)
        for (let dx = -half; dx <= half; dx++) {
          const i = ((((cy + dy) % N) + N) % N) * N + ((((cx + dx) % N) + N) % N);
          v[i] += c.noise * (rng.uniform() - 0.5);
          u[i] += c.noise * (rng.uniform() - 0.5);
        }
  }
  return sim;
}

// FNV-style hash of a field, for reproducibility checks.
export function fieldHash(arr) {
  let h = 0x811c9dc5;
  const f = new Float64Array(1);
  const w = new Uint32Array(f.buffer);
  for (let i = 0; i < arr.length; i++) {
    f[0] = arr[i];
    h = Math.imul(h ^ w[0], 0x01000193);
    h = Math.imul(h ^ w[1], 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export const jobs = {};
