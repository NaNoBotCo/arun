import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, fieldHash, stabilityNumber, jobs } from '../../src/kernels/e08.js';

const rmse = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0) / a.length);

test('exports a jobs object', () => assert.equal(typeof jobs, 'object'));

test('constant equilibrium u=1, v=0 stays exactly unchanged', () => {
  const s = createSim({ N: 32, spots: 0 }, 1);
  const r = s.step(500);
  assert.equal(r.ok, true);
  const { u, v } = s.snapshot();
  assert.ok(u.every((x) => x === 1));
  assert.ok(v.every((x) => x === 0));
});

test('a spatially uniform state follows the reaction ODE (RK4 reference, tolerance 2e-3)', () => {
  // With no gradients the Laplacian is zero, so the grid must follow du/dt=-uv²+F(1-u), dv/dt=uv²-(F+k)v.
  const F = 0.04, k = 0.06, dt = 0.01, T = 20;
  const s = createSim({ N: 16, F, k, dt, spots: 0 }, 1);
  const { u, v } = s.snapshot();
  u.fill(0.6);
  v.fill(0.2);
  s.step(T / dt);
  const f = ([a, b]) => [-a * b * b + F * (1 - a), a * b * b - (F + k) * b];
  let y = [0.6, 0.2];
  const h = 0.001;
  for (let i = 0; i < T / h; i++) {
    const k1 = f(y);
    const k2 = f([y[0] + (h / 2) * k1[0], y[1] + (h / 2) * k1[1]]);
    const k3 = f([y[0] + (h / 2) * k2[0], y[1] + (h / 2) * k2[1]]);
    const k4 = f([y[0] + h * k3[0], y[1] + h * k3[1]]);
    y = [y[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), y[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
  }
  const snap = s.snapshot();
  assert.ok(Math.abs(snap.u[0] - y[0]) < 2e-3, `u ${snap.u[0]} vs ${y[0]}`);
  assert.ok(Math.abs(snap.v[0] - y[1]) < 2e-3, `v ${snap.v[0]} vs ${y[1]}`);
  assert.ok(snap.u.every((x) => x === snap.u[0]), 'uniform stays uniform');
});

test('one cosine diffusion mode decays at the exact discrete rate and near the continuum rate (v=0, tolerance 1e-9 and 1e-3)', () => {
  const N = 64, F = 0.02, Du = 0.16, dt = 0.05, nSteps = 1000;
  const s = createSim({ N, F, k: 0.06, Dv: 0.08, ratio: 2, dt, spots: 0 }, 1);
  const { u } = s.snapshot();
  const a0 = 0.01;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) u[y * N + x] = 1 + a0 * Math.cos((2 * Math.PI * x) / N);
  s.step(nSteps);
  const lamD = -(Du * (2 - 2 * Math.cos((2 * Math.PI) / N)) + F); // exact discrete eigenvalue
  const expected = a0 * (1 + dt * lamD) ** nSteps;
  const amp = (s.snapshot().u[0] - 1); // x = 0 is the cosine peak
  assert.ok(Math.abs(amp - expected) < 1e-9, `${amp} vs ${expected}`);
  const lamC = -(Du * (2 * Math.PI / N) ** 2 + F); // continuum rate
  const cont = a0 * Math.exp(lamC * dt * nSteps);
  assert.ok(Math.abs(amp - cont) / cont < 1e-3, `continuum ${cont}`);
});

test('no NaN or Infinity after 4000 steps of the default pattern; fields stay in [0, 1.2]', () => {
  const s = createSim({ N: 64, F: 0.0367, k: 0.0649 }, 7);
  assert.equal(s.step(4000).ok, true);
  const st = s.stats();
  assert.equal(st.finite, true);
  assert.ok(st.minU > -0.01 && st.maxU < 1.2 && st.minV > -0.01 && st.maxV < 1.2, JSON.stringify(st));
  assert.ok(st.varV > 1e-4, 'pattern formed');
});

test('wrap-around: shifting the initial patch by (dx, dy) shifts the field by the same amount (tolerance 1e-12)', () => {
  const N = 32, dx = 7, dy = 19;
  const a = createSim({ N, spots: 0 }, 1);
  const b = createSim({ N, spots: 0 }, 1);
  a.plant(3, 30, 2); // patch wraps over the top edge
  b.plant((3 + dx) % N, (30 + dy) % N, 2);
  a.step(300);
  b.step(300);
  const A = a.snapshot().v, B = b.snapshot().v;
  let maxd = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) maxd = Math.max(maxd, Math.abs(A[y * N + x] - B[((y + dy) % N) * N + ((x + dx) % N)]));
  assert.ok(maxd < 1e-12, `max difference ${maxd}`);
});

test('mirror symmetry: a patch symmetric about x = 0 stays symmetric (tolerance 1e-12)', () => {
  const N = 32;
  const s = createSim({ N, spots: 0 }, 1);
  s.plant(0, 10, 3);
  s.step(400);
  const { v } = s.snapshot();
  let maxd = 0;
  for (let y = 0; y < N; y++) for (let x = 1; x < N; x++) maxd = Math.max(maxd, Math.abs(v[y * N + x] - v[y * N + (N - x)]));
  assert.ok(maxd < 1e-12, `asymmetry ${maxd}`);
  assert.ok(v.some((x) => x > 0.01));
});

test('smaller timestep converges: error against a dt = 1/16 run falls at first-order rate', () => {
  const T = 16;
  const run = (dt) => {
    const s = createSim({ N: 32, F: 0.0367, k: 0.0649, dt, spots: 3 }, 5);
    s.step(Math.round(T / dt));
    return Array.from(s.snapshot().v);
  };
  const ref = run(1 / 16);
  const e1 = rmse(run(1), ref), e2 = rmse(run(0.5), ref), e3 = rmse(run(0.25), ref);
  assert.ok(e1 > e2 && e2 > e3, `${e1} ${e2} ${e3}`);
  assert.ok(e1 / e2 > 1.6 && e1 / e2 < 2.6, `ratio ${e1 / e2}`);
  assert.ok(e2 / e3 > 1.6 && e2 / e3 < 2.6, `ratio ${e2 / e3}`);
});

test('seeded reproducibility: same seed gives identical fields; another seed differs', () => {
  const run = (seed) => {
    const s = createSim({ N: 48 }, seed);
    s.step(300);
    return fieldHash(s.snapshot().v);
  };
  assert.equal(run(11), run(11));
  assert.notEqual(run(11), run(12));
});

test('too large a step is reported as failure, not repaired', () => {
  const s = createSim({ N: 32, dt: 3.5, ratio: 3, Dv: 0.08, spots: 4 }, 2);
  assert.ok(s.stability > 0.25);
  const r = s.step(2000);
  assert.equal(r.ok, false);
  assert.match(r.reason, /too large/);
  assert.equal(s.step(5).ok, false);
  assert.equal(stabilityNumber(0.16, 0.08, 1), 0.16);
});

test('a stable step number does not blow up; dead feed region decays to uniform u=1', () => {
  const ok = createSim({ N: 32, dt: 1, ratio: 3, Dv: 0.08, spots: 4 }, 2); // D dt = 0.24
  assert.ok(ok.stability <= 0.25);
  assert.equal(ok.step(2000).ok, true);
  const dead = createSim({ N: 32, F: 0.08, k: 0.07 }, 4);
  dead.step(3000);
  assert.ok(dead.stats().maxV < 1e-6);
});

test('out-of-range configuration throws a plain message', () => {
  assert.throws(() => createSim({ N: 8 }, 1), /N must be between 16 and 256/);
  assert.throws(() => createSim({ F: -0.1 }, 1), /F must be between/);
  assert.throws(() => createSim({ dt: 0 }, 1), /dt must be between/);
  assert.throws(() => createSim({ N: 40.5 }, 1), /whole number/);
});

test('setParams in flight equals a run created with those parameters (same seed, tolerance 0)', () => {
  const a = createSim({ N: 32, F: 0.02, k: 0.05 }, 5);
  a.setParams({ F: 0.0367, k: 0.0649, dt: 0.5 });
  const b = createSim({ N: 32, F: 0.0367, k: 0.0649, dt: 0.5 }, 5);
  a.step(200);
  b.step(200);
  assert.deepEqual(Array.from(a.snapshot().v), Array.from(b.snapshot().v));
  assert.equal(a.t, 100);
  assert.throws(() => a.setParams({ dt: 0 }), /dt must be between/);
});
