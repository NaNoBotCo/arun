import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPair, rk4, rhs, lyapunovEstimate, growthFit, jobs, DEFAULTS } from '../../src/kernels/e09.js';

test('exports jobs', () => assert.equal(typeof jobs['e09.lyapunov'], 'function'));

test('exact initial match stays exactly matched (separation 0 after 20 time units)', () => {
  const p = createPair({ eps: 0 }, 5);
  assert.equal(p.separation(), 0);
  p.step(4000);
  assert.equal(p.separation(), 0);
  assert.ok(Number.isFinite(p.a[0]));
});

test('standard chaotic preset: separation 1e-8 grows past 1 by t = 40 and stops near the attractor size', () => {
  const p = createPair({ eps: 1e-8 }, 3);
  assert.ok(Math.abs(p.separation() - 1e-8) < 1e-14);
  p.step(Math.round(40 / DEFAULTS.dt));
  const sep40 = p.separation();
  assert.ok(sep40 > 1, `sep at t=40 is ${sep40}`);
  let mx = 0;
  for (let i = 0; i < 4000; i++) {
    p.step(1);
    mx = Math.max(mx, p.separation());
  }
  assert.ok(mx < 80 && mx > 15, `max separation ${mx}`);
  assert.ok(p.saturation() > 15 && p.saturation() < 30, `saturation ${p.saturation()}`);
});

test('growth rate of ln d before saturation is near the known exponent 0.906 (window 0.75–1.05)', () => {
  const p = createPair({ eps: 1e-8 }, 3);
  const ts = [], ds = [];
  for (let i = 0; i < 6000; i++) {
    p.step(1);
    if (i % 10 === 0) {
      ts.push(p.t);
      ds.push(p.separation());
    }
  }
  const f = growthFit(ts, ds, { dMin: 1e-6, dMax: 0.05 * p.saturation() });
  assert.ok(f.slope > 0.75 && f.slope < 1.05, `slope ${f.slope}`);
});

test('Benettin estimate for sigma=10, rho=28, beta=8/3 is 0.9056 within 0.06; negative for rho=0.5; near zero in the rho=100 periodic window', () => {
  const l = lyapunovEstimate({}, { T: 300 }, 4);
  assert.ok(Math.abs(l.lambda - 0.9056) < 0.06, `lambda ${l.lambda}`);
  assert.ok(lyapunovEstimate({ rho: 0.5 }, { T: 100 }, 4).lambda < -0.3);
  assert.ok(Math.abs(lyapunovEstimate({ rho: 100 }, { T: 200 }, 4).lambda) < 0.05);
});

test('smaller dt converges over a short horizon: RK4 error falls at least 12x per halving (fourth order or better) (T = 2)', () => {
  const T = 2;
  const run = (dt) => {
    const p = createPair({ dt, eps: 0, x0: [1, 1, 1] }, 1);
    p.step(Math.round(T / dt));
    return p.a.slice();
  };
  const ref = run(0.0005);
  const err = (dt) => Math.hypot(...run(dt).map((x, i) => x - ref[i]));
  const e1 = err(0.01), e2 = err(0.005), e3 = err(0.0025);
  assert.ok(e1 > e2 && e2 > e3, `${e1} ${e2} ${e3}`);
  assert.ok(e1 / e2 > 12 && e1 / e2 < 45, `ratio ${e1 / e2}`);
  assert.ok(e3 < 1e-6, `e3 ${e3}`);
});

test('analytic reference: on the z axis (x = y = 0) the exact solution is z(t) = z0 exp(-beta t), tolerance 1e-9', () => {
  const p = createPair({ x0: [0, 0, 5], eps: 0, dt: 0.01 }, 1);
  p.step(300);
  const exact = 5 * Math.exp(-DEFAULTS.beta * 3);
  assert.ok(Math.abs(p.a[2] - exact) < 1e-9, `${p.a[2]} vs ${exact}`);
  assert.equal(p.a[0], 0);
});

test('analytic reference: fixed points C± = (±√(β(ρ−1)), ±√(β(ρ−1)), ρ−1) have zero right-hand side and stay put', () => {
  const q = Math.sqrt(DEFAULTS.beta * (DEFAULTS.rho - 1));
  const s = [q, q, DEFAULTS.rho - 1];
  const r = rhs(s, DEFAULTS);
  assert.ok(Math.hypot(...r) < 1e-12);
  const p = createPair({ x0: s, eps: 0 }, 1);
  p.step(2000);
  assert.ok(Math.hypot(p.a[0] - s[0], p.a[1] - s[1], p.a[2] - s[2]) < 1e-9);
});

test('analytic reference: phase-space volume contracts at rate σ+1+β (flow-map Jacobian determinant by finite differences, tolerance 1e-5 relative)', () => {
  const t = 0.1, dt = 0.001, h = 1e-5;
  const x0 = [2, -3, 20];
  const flow = (x) => {
    const s = x.slice();
    for (let i = 0; i < t / dt; i++) rk4(s, DEFAULTS, dt);
    return s;
  };
  const J = [0, 1, 2].map((j) => {
    const xp = x0.slice(), xm = x0.slice();
    xp[j] += h;
    xm[j] -= h;
    const fp = flow(xp), fm = flow(xm);
    return fp.map((v, i) => (v - fm[i]) / (2 * h));
  }); // J[j][i] = d f_i / d x_j
  const det = J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) + J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]);
  const expected = Math.exp(-(DEFAULTS.sigma + 1 + DEFAULTS.beta) * t);
  assert.ok(Math.abs(det - expected) / expected < 1e-5, `${det} vs ${expected}`);
});

test('seeded reproducibility: same seed gives identical trajectories and kick direction; another seed differs', () => {
  const run = (seed) => {
    const p = createPair({ eps: 1e-6 }, seed);
    p.step(1500);
    p.nudgeB(0.1);
    p.step(500);
    return [...p.a, ...p.b, p.separation()];
  };
  assert.deepEqual(run(9), run(9));
  assert.notDeepEqual(run(9), run(10));
});

test('out-of-range input throws a plain message', () => {
  assert.throws(() => createPair({ sigma: -1 }, 1), /sigma must be between/);
  assert.throws(() => createPair({ dt: 1 }, 1), /dt must be between/);
  assert.throws(() => createPair({ rho: NaN }, 1), /rho must be between/);
});
