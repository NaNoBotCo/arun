import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phyllotaxis, nearestNeighbours, nearestNeighboursBrute, radialDensity, rationalTurns, analyze, GOLDEN_ANGLE_DEG, PHI, jobs } from '../../src/kernels/e12.js';

const base = { N: 500, angle_deg: GOLDEN_ANGLE_DEG, amp: 0, sym: 5, jitter: 0, scale_mm: 1 };

test('golden angle is 137.50776 degrees (tolerance 1e-5)', () => {
  assert.ok(Math.abs(GOLDEN_ANGLE_DEG - 137.50776405) < 1e-5);
  assert.ok(Math.abs(360 * (1 - 1 / PHI) - GOLDEN_ANGLE_DEG) < 1e-9);
});

test('point count is exact and every coordinate is finite', () => {
  for (const N of [1, 2, 37, 1000, 6000]) {
    const p = phyllotaxis({ ...base, N, amp: 0.4, jitter: 0.2 }, 3);
    assert.equal(p.x.length, N);
    assert.equal(p.y.length, N);
    for (let i = 0; i < N; i++) assert.ok(Number.isFinite(p.x[i]) && Number.isFinite(p.y[i]));
  }
});

test('radial distance equals c*sqrt(n) when modulation and jitter are zero (1e-9)', () => {
  const p = phyllotaxis({ ...base, scale_mm: 1.7 });
  for (let n = 0; n < p.N; n++) assert.ok(Math.abs(Math.hypot(p.x[n], p.y[n]) - 1.7 * Math.sqrt(n)) < 1e-9);
});

test('modulated radius follows r(1 + a sin(k theta)) (1e-9)', () => {
  const cfg = { ...base, amp: 0.3, sym: 7 };
  const p = phyllotaxis(cfg);
  const al = (cfg.angle_deg * Math.PI) / 180;
  for (let n = 0; n < p.N; n++) {
    const want = Math.sqrt(n) * (1 + 0.3 * Math.sin(7 * n * al));
    assert.ok(Math.abs(Math.hypot(p.x[n], p.y[n]) - want) < 1e-9);
  }
});

test('reference check: grid-hash nearest neighbours equal brute force', () => {
  for (const [cfg, seed] of [[base, 0], [{ ...base, N: 300, amp: 0.5, jitter: 0.4 }, 9], [{ ...base, angle_deg: 90, N: 200 }, 0]]) {
    const p = phyllotaxis(cfg, seed);
    const a = nearestNeighbours(p.x, p.y);
    const b = nearestNeighboursBrute(p.x, p.y);
    for (let i = 0; i < p.N; i++) assert.ok(Math.abs(a.nn[i] - b.nn[i]) < 1e-12, `point ${i}`);
  }
});

test('nearest neighbour offsets of the golden spiral are Fibonacci numbers', () => {
  const fib = new Set([1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377]);
  const a = analyze({ ...base, N: 1500 });
  for (const s of a.spirals) assert.ok(fib.has(s.offset), `offset ${s.offset}`);
});

test('a rational angle puts points on q rays and leaves wide gaps; the golden angle does not', () => {
  assert.deepEqual(rationalTurns(120), { p: 1, q: 3 });
  assert.equal(rationalTurns(GOLDEN_ANGLE_DEG), null);
  const p = phyllotaxis({ ...base, angle_deg: 120, N: 600 });
  const dirs = new Set();
  for (let n = 1; n < p.N; n++) dirs.add(Math.round(((Math.atan2(p.y[n], p.x[n]) * 180) / Math.PI + 360) % 360) % 360);
  assert.equal(dirs.size, 3);
  const g = analyze({ ...base, N: 600 });
  const r = analyze({ ...base, angle_deg: 120, N: 600 });
  assert.ok(r.gapRatio > 3 * g.gapRatio, `${r.gapRatio} vs ${g.gapRatio}`);
  assert.ok(r.rays === 3 && g.rays === null);
});

test('golden spiral packs evenly: radial density within 15% of 1/(pi c^2) in outer rings', () => {
  const a = analyze({ ...base, N: 4000 }, 0, 10);
  const want = 1 / Math.PI;
  for (let b = 3; b < 9; b++) assert.ok(Math.abs(a.radial.density[b] / want - 1) < 0.15, `ring ${b}: ${a.radial.density[b]}`);
});

test('seeded reproducibility: same seed same points, new seed differs, no jitter ignores seed', () => {
  const c = { ...base, jitter: 0.3 };
  assert.deepEqual(Array.from(phyllotaxis(c, 5).x), Array.from(phyllotaxis(c, 5).x));
  assert.notDeepEqual(Array.from(phyllotaxis(c, 5).x), Array.from(phyllotaxis(c, 6).x));
  assert.deepEqual(Array.from(phyllotaxis(base, 1).y), Array.from(phyllotaxis(base, 2).y));
});

test('bad input throws a plain message', () => {
  assert.throws(() => phyllotaxis({ ...base, N: 0 }), /N must be between 1 and 6000/);
  assert.throws(() => phyllotaxis({ ...base, N: 10.5 }), /whole number/);
  assert.throws(() => phyllotaxis({ ...base, amp: 1 }), /amp must be between/);
  assert.throws(() => phyllotaxis({ ...base, angle_deg: NaN }), /angle_deg/);
});

test('radial density bins sum to N and kernel exports jobs', () => {
  const p = phyllotaxis(base);
  const r = radialDensity(p.x, p.y, 12);
  assert.equal(r.counts.reduce((a, b) => a + b, 0), p.N);
  assert.equal(typeof jobs, 'object');
});
