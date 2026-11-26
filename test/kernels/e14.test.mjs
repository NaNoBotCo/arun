import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, makeField, divergenceMax, traceRK2, traceRK4, DEFAULTS, LIMITS, jobs, streamlines } from '../../src/kernels/e14.js';

const calm = { ...DEFAULTS, n_vortices: 0, meander_km2_h: 0, diffusion_km2_h: 0, source_kg_h: 0, tracer_rate_per_h: 0, grid_n: 80 };

test('stationary field: amp 0 and D 0 leave tracers and scalar in place', () => {
  const s = createSim({ ...calm, amp: 0 }, 1);
  s.setBlob(5, 5, 0.6, 100);
  s.addTracers(200, 5, 5, 0.3);
  const before = Array.from(s.snapshot().px.slice(0, 200));
  const q0 = Float64Array.from(s.snapshot().q);
  for (let i = 0; i < 20; i++) s.step(0.1);
  assert.deepEqual(Array.from(s.snapshot().px.slice(0, 200)), before);
  assert.deepEqual(Array.from(s.snapshot().q), Array.from(q0));
});

test('analytic divergence is below 1e-6 for vortices plus meander plus wind', () => {
  for (const seed of [0, 1, 2]) assert.ok(divergenceMax(makeField({ ...DEFAULTS, n_vortices: 4, meander_km2_h: 3 }, seed)) < 1e-6);
});

test('discrete face-flux divergence is below 1e-12 per cell', () => {
  const s = createSim({ ...DEFAULTS, n_vortices: 4 }, 3);
  assert.ok(s.cellDivergenceMax() < 1e-12, String(s.cellDivergenceMax()));
});

test('mass budget closes to 1e-10 relative, including outflow, and concentration stays nonnegative', () => {
  const s = createSim({ ...DEFAULTS, wind_km_h: 8, diffusion_km2_h: 0.1, grid_n: 64 }, 4);
  let min = 0;
  for (let i = 0; i < 80; i++) {
    assert.ok(s.step(0.1), s.halted);
    for (const v of s.snapshot().q) min = Math.min(min, v);
  }
  const d = s.diagnostics();
  assert.ok(d.out_kg > 1, 'some mass left the domain');
  assert.ok(Math.abs(d.residual_kg) < 1e-10 * d.released_kg, String(d.residual_kg));
  assert.ok(min > -1e-12, String(min));
});

test('RK2 tracer path is second order: halving dt cuts the end-point error against RK4 by about 4', () => {
  const f = makeField({ ...DEFAULTS, n_vortices: 3, vortex_strength_km2_h: 8, vortex_radius_km: 1.5 }, 2);
  const ref = traceRK4(f, 3, 4, 3, 0.0005);
  const err = (dt) => { const p = traceRK2(f, 3, 4, 3, dt); return Math.hypot(p[0] - ref[0], p[1] - ref[1]); };
  const r = err(0.1) / err(0.05);
  assert.ok(r > 3 && r < 5.5, `ratio ${r}`);
});

test('reference check: RK2 path matches an RK4 path with a small step (1e-3 km)', () => {
  const f = makeField({ ...DEFAULTS }, 5);
  const a = traceRK2(f, 3, 4, 2, 0.01), b = traceRK4(f, 3, 4, 2, 0.002);
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3);
});

test('uniform wind moves the grid centroid and the tracer centroid by U t', () => {
  const s = createSim({ ...calm, wind_km_h: 5, amp: 1 }, 6);
  s.setBlob(2, 5, 0.5, 50);
  s.addTracers(2000, 2, 5, 0.5);
  for (let i = 0; i < 10; i++) assert.ok(s.step(0.1));
  const g = s.gridMoments(), p = s.meanTracer();
  assert.ok(Math.abs(g.x - 7) < 0.1, `grid ${g.x}`);
  assert.ok(Math.abs(p.x - 7) < 0.1, `tracers ${p.x}`);
  assert.ok(Math.abs(g.y - 5) < 0.02);
  assert.ok(Math.abs(s.diagnostics().residual_kg) < 1e-10);
});

test('pure diffusion: variance grows as sigma0^2 + 2 D t within 5% on the grid and 6% for tracers', () => {
  const D = 0.2, s0 = 0.5, T = 2;
  const s = createSim({ ...calm, amp: 0, diffusion_km2_h: D, grid_n: 100 }, 7);
  s.setBlob(5, 5, s0, 10);
  s.addTracers(6000, 5, 5, s0);
  for (let i = 0; i < 20; i++) assert.ok(s.step(T / 20));
  const want = s0 * s0 + 2 * D * T;
  const g = s.gridMoments(), p = s.meanTracer();
  assert.ok(Math.abs(g.varx / want - 1) < 0.05, `grid ${g.varx} vs ${want}`);
  assert.ok(Math.abs(p.varx / want - 1) < 0.06, `tracers ${p.varx} vs ${want}`);
});

test('travel time equals distance over speed in uniform wind', () => {
  const s = createSim({ ...calm, wind_km_h: 5, amp: 1, source_kg_h: 10, tracer_rate_per_h: 800, source: [2, 5], receptor: [8, 5], receptor_r_km: 0.2 }, 8);
  for (let i = 0; i < 30; i++) s.step(0.1);
  const d = s.diagnostics();
  assert.ok(d.tt.n > 100);
  assert.ok(Math.abs(d.tt.median - (6 - 0.2) / 5) < 0.06, `median ${d.tt.median}`);
});

test('an unsafe Courant number is detected and the run halts with a reason', () => {
  const s = createSim({ ...DEFAULTS, unsafe_courant: true, wind_km_h: 8, grid_n: 64 }, 9);
  let ok = true;
  for (let i = 0; i < 60 && ok; i++) ok = s.step(0.1);
  assert.equal(ok, false);
  assert.match(s.halted, /negative|not finite|budget/);
  const safe = createSim({ ...DEFAULTS, wind_km_h: 8, grid_n: 64 }, 9);
  for (let i = 0; i < 60; i++) assert.ok(safe.step(0.1));
  assert.ok(safe.diagnostics().courant <= 0.4 + 1e-9);
});

test('a step that needs too many substeps halts and says why', () => {
  const s = createSim({ ...DEFAULTS, grid_n: 128, diffusion_km2_h: 1, wind_km_h: 12, amp: 3 }, 1);
  assert.equal(s.step(10), false);
  assert.match(s.halted, /substeps/);
});

test('seeded reproducibility: same seed same state; other seed differs', () => {
  const run = (seed) => { const s = createSim({ ...DEFAULTS, grid_n: 48 }, seed); for (let i = 0; i < 15; i++) s.step(0.1); return s; };
  const a = run(11), b = run(11), c = run(12);
  assert.deepEqual(Array.from(a.snapshot().q), Array.from(b.snapshot().q));
  assert.deepEqual(Array.from(a.snapshot().px.slice(0, a.snapshot().nt)), Array.from(b.snapshot().px.slice(0, b.snapshot().nt)));
  assert.notDeepEqual(Array.from(a.snapshot().q), Array.from(c.snapshot().q));
  assert.deepEqual(streamlines(a.field, 11, 5, 20), streamlines(b.field, 11, 5, 20));
});

test('bad input throws a plain message; jobs is an object', () => {
  assert.throws(() => createSim({ ...DEFAULTS, grid_n: 10 }, 1), /grid_n must be between 32 and 128/);
  assert.throws(() => createSim({ ...DEFAULTS, diffusion_km2_h: -1 }, 1), /diffusion_km2_h must be between/);
  assert.throws(() => createSim({ ...DEFAULTS, n_vortices: 1.5 }, 1), /whole number/);
  assert.throws(() => createSim({ ...DEFAULTS, source: [11, 2] }, 1), /source must be a point/);
  assert.equal(typeof jobs, 'object');
  assert.ok(LIMITS.amp);
});
