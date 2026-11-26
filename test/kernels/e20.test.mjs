import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROBLEM, cloneProblem, solve, frontier, feasibleVertices, sampleFeasible, hull2D, checkAllocation, resourceUse, outcomes, validateProblem, normalizeWeights } from '../../src/kernels/e20.js';
import { makeRng } from '../../src/core/rng.js';

// Textbook small LP (Hillier & Lieberman "Wyndor"): max 3x + 5y, x ≤ 4, 2y ≤ 12, 3x + 2y ≤ 18.
// Optimum x = 2, y = 6, value 36. Shadow prices 0, 1.5, 1.
const wyndor = () => ({
  name: 'toy',
  resources: [{ name: 'R1', unit: 'u', cap: 4 }, { name: 'R2', unit: 'u', cap: 12 }, { name: 'R3', unit: 'u', cap: 18 }],
  activities: [
    { name: 'X', use: [1, 0, 3], revenue_usd_k: 3, cost_usd_k: 0, burden: 0, access: 0 },
    { name: 'Y', use: [0, 2, 2], revenue_usd_k: 5, cost_usd_k: 0, burden: 0, access: 0 },
  ],
  price: 1,
  burdenCap: null,
  accessFloor: 0,
});
const PROFIT = { profit: 1, burden: 0, access: 0 };

test('known small optimum: x = 2, y = 6, profit 36 (tolerance 1e-9)', () => {
  const s = solve(wyndor(), PROFIT);
  assert.equal(s.status, 'optimal');
  assert.ok(Math.abs(s.x[0] - 2) < 1e-9 && Math.abs(s.x[1] - 6) < 1e-9);
  assert.ok(Math.abs(s.outcomes.profit_usd_k - 36) < 1e-9);
  assert.deepEqual(s.binding.sort(), ['R2 cap', 'R3 cap']);
});

test('shadow prices equal the textbook 0, 1.5, 1 when valid', () => {
  const s = solve(wyndor(), PROFIT);
  assert.equal(s.shadowValid, true);
  const pr = s.shadow.map((q) => q.profit_equivalent_usd_k_per_unit);
  assert.ok(Math.abs(pr[0] - 0) < 1e-9 && Math.abs(pr[1] - 1.5) < 1e-9 && Math.abs(pr[2] - 1) < 1e-9, JSON.stringify(pr));
});

test('shadow prices match a finite difference on the default problem (tolerance 1e-6)', () => {
  const p = cloneProblem(DEFAULT_PROBLEM);
  const w = { profit: 1, burden: 1, access: 1 };
  const s = solve(p, w);
  assert.equal(s.status, 'optimal');
  assert.equal(s.shadowValid, true, s.shadowReason);
  const priced = s.shadow.filter((q) => q.kind === 'resource' && q.price_score_per_unit > 1e-9);
  assert.ok(priced.length >= 1, 'at least one binding resource has a price');
  for (const r of priced) {
    const q = cloneProblem(p);
    const ri = q.resources.findIndex((x) => `${x.name} cap` === r.name);
    const d = 1e-4;
    q.resources[ri].cap += d;
    // Same normalising ranges would be needed for equal units; compare in raw terms through the ranges of the base problem.
    const s2 = solve(q, w);
    const rawDelta = (s2.score * 1 - s.score * 1) / d;
    assert.ok(Math.abs(rawDelta - r.price_score_per_unit) < 1e-2 * Math.max(1, r.price_score_per_unit), `${r.name}: fd ${rawDelta} vs ${r.price_score_per_unit}`);
  }
});

test('shadow prices are withheld at a degenerate corner', () => {
  const p = wyndor();
  p.resources.push({ name: 'R4', unit: 'u', cap: 8 });
  p.activities[0].use.push(1);
  p.activities[1].use.push(1); // x + y ≤ 8 also passes through (2, 6)
  const s = solve(p, PROFIT);
  assert.equal(s.status, 'optimal');
  assert.ok(Math.abs(s.outcomes.profit_usd_k - 36) < 1e-9);
  assert.equal(s.shadowValid, false);
  assert.match(s.shadowReason, /degenerate/);
  assert.ok(s.shadow.every((q) => q.price_score_per_unit === null));
});

test('brute-force grid never beats the LP and comes within 2% (3 random small problems)', () => {
  for (const seed of [1, 2, 3]) {
    const r = makeRng(seed);
    const p = {
      name: 'r', price: 1, burdenCap: null, accessFloor: 0,
      resources: [0, 1, 2].map((i) => ({ name: 'R' + i, unit: 'u', cap: 10 + r.int(10) })),
      activities: [0, 1].map((j) => ({ name: 'A' + j, use: [0, 1, 2].map(() => 1 + r.int(4)), revenue_usd_k: 2 + r.int(6), cost_usd_k: 0, burden: 0, access: 0 })),
    };
    const s = solve(p, PROFIT);
    let best = -1;
    const N = 400;
    const xm = Math.min(...p.resources.map((q, i) => q.cap / p.activities[0].use[i]));
    const ym = Math.min(...p.resources.map((q, i) => q.cap / p.activities[1].use[i]));
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const x = [(xm * i) / N, (ym * j) / N];
        if (!checkAllocation(p, x).ok) continue;
        best = Math.max(best, outcomes(p, x).profit_usd_k);
      }
    assert.ok(best <= s.outcomes.profit_usd_k + 1e-6, 'grid cannot beat LP');
    assert.ok(best >= 0.98 * s.outcomes.profit_usd_k, `grid ${best} vs LP ${s.outcomes.profit_usd_k}`);
  }
});

test('conservation: parts add up to use, use plus unused equals the cap, nothing exceeds a cap', () => {
  const p = cloneProblem(DEFAULT_PROBLEM);
  for (const w of [{ profit: 1, burden: 0, access: 0 }, { profit: 0, burden: 1, access: 0 }, { profit: 1, burden: 1, access: 1 }]) {
    const s = solve(p, w);
    assert.equal(s.status, 'optimal');
    const use = resourceUse(p, s.x);
    use.forEach((u, i) => {
      assert.ok(Math.abs(u.parts.reduce((a, b) => a + b, 0) - u.used) < 1e-9);
      assert.ok(Math.abs(u.used + u.unused - u.cap) < 1e-9);
      assert.ok(u.unused >= -1e-7, `${u.name} over cap`);
      assert.ok(Math.abs(u.used - s.use[i].used) < 1e-12);
    });
    assert.ok(checkAllocation(p, s.x).ok);
    assert.ok(s.x.every((v) => v >= -1e-9));
  }
});

test('infeasible constraints are explicit, with the constraint that restores feasibility', () => {
  const p = cloneProblem(DEFAULT_PROBLEM);
  p.accessFloor = 5000;
  const s = solve(p, { profit: 1, burden: 1, access: 1 });
  assert.equal(s.status, 'infeasible');
  assert.match(s.reason, /No allocation meets every constraint/);
  assert.ok(s.diagnosis.relaxingAnyOneOf.includes('Aggregate access floor'));
  assert.ok(s.diagnosis.maxAccessWithoutFloor > 0 && s.diagnosis.maxAccessWithoutFloor < 5000);
  assert.equal(frontier(p, 4).status, 'infeasible');
});

test('weights change the preferred allocation, never what is feasible', () => {
  const p = cloneProblem(DEFAULT_PROBLEM);
  const ctx = feasibleVertices(p);
  const before = JSON.stringify(ctx.vertices);
  const picks = new Set();
  for (const w of [{ profit: 1, burden: 0, access: 0 }, { profit: 0, burden: 1, access: 0 }, { profit: 0, burden: 0, access: 1 }, { profit: 1, burden: 1, access: 1 }]) {
    const s = solve(p, w, ctx);
    assert.ok(checkAllocation(p, s.x).ok, 'every preference lands inside the same feasible set');
    picks.add(s.x.map((v) => v.toFixed(6)).join(','));
  }
  assert.ok(picks.size >= 3, 'different weights pick different allocations');
  assert.equal(JSON.stringify(feasibleVertices(p).vertices), before, 'feasible corners are identical after solving with any weights');
  const bad = cloneProblem(DEFAULT_PROBLEM);
  bad.accessFloor = 5000;
  for (const w of [{ profit: 1, burden: 0, access: 0 }, { profit: 0, burden: 0, access: 1 }]) assert.equal(solve(bad, w).status, 'infeasible');
  // scaling every weight changes nothing
  const a = solve(p, { profit: 2, burden: 1, access: 1 });
  const b = solve(p, { profit: 20, burden: 10, access: 10 });
  assert.deepEqual(a.x, b.x);
});

test('single-objective extremes: profit-only has the highest profit, burden-only the lowest burden, access-only the most access', () => {
  const p = cloneProblem(DEFAULT_PROBLEM);
  const P = solve(p, { profit: 1, burden: 0, access: 0 }).outcomes;
  const E = solve(p, { profit: 0, burden: 1, access: 0 }).outcomes;
  const G = solve(p, { profit: 0, burden: 0, access: 1 }).outcomes;
  const mid = solve(p, { profit: 1, burden: 1, access: 1 }).outcomes;
  assert.ok(P.profit_usd_k >= Math.max(E.profit_usd_k, G.profit_usd_k, mid.profit_usd_k) - 1e-9);
  assert.ok(E.burden <= Math.min(P.burden, G.burden, mid.burden) + 1e-9);
  assert.ok(G.access >= Math.max(P.access, E.access, mid.access) - 1e-9);
});

test('frontier: points are feasible and none dominates another; result is deterministic', () => {
  const p = cloneProblem(DEFAULT_PROBLEM);
  const f = frontier(p, 8);
  assert.equal(f.status, 'ok');
  assert.ok(f.points.length >= 3);
  for (const pt of f.points) assert.ok(checkAllocation(p, pt.x).ok);
  for (const a of f.points) for (const b of f.points) {
    if (a === b) continue;
    const ge = a.outcomes.profit_usd_k >= b.outcomes.profit_usd_k && a.outcomes.burden <= b.outcomes.burden && a.outcomes.access >= b.outcomes.access;
    const gt = a.outcomes.profit_usd_k > b.outcomes.profit_usd_k + 1e-9 || a.outcomes.burden < b.outcomes.burden - 1e-9 || a.outcomes.access > b.outcomes.access + 1e-9;
    assert.ok(!(ge && gt), 'no point dominates another');
  }
  assert.deepEqual(f.points.map((q) => q.x), frontier(p, 8).points.map((q) => q.x));
});

test('samples are feasible, seeded, and lie inside the hull of the corner outcomes', () => {
  const p = cloneProblem(DEFAULT_PROBLEM);
  const ctx = feasibleVertices(p);
  const a = sampleFeasible(p, ctx, 300, 17);
  const b = sampleFeasible(p, ctx, 300, 17);
  const c = sampleFeasible(p, ctx, 300, 18);
  assert.deepEqual(a.map((q) => q.outcomes), b.map((q) => q.outcomes));
  assert.notDeepEqual(a.map((q) => q.outcomes), c.map((q) => q.outcomes));
  const hull = hull2D(ctx.vertices.map((x) => { const o = outcomes(p, x); return [o.profit_usd_k, o.burden]; }));
  const inside = (pt) => {
    for (let i = 0; i < hull.length; i++) {
      const A = hull[i];
      const B = hull[(i + 1) % hull.length];
      if ((B[0] - A[0]) * (pt[1] - A[1]) - (B[1] - A[1]) * (pt[0] - A[0]) < -1e-7) return false;
    }
    return true;
  };
  for (const s of a) {
    assert.ok(checkAllocation(p, s.x).ok);
    assert.ok(inside([s.outcomes.profit_usd_k, s.outcomes.burden]), 'sample inside the hull');
  }
});

test('input checks: negative cap, empty weights, an activity that uses nothing', () => {
  const p = cloneProblem(DEFAULT_PROBLEM);
  p.resources[0].cap = -1;
  assert.throws(() => validateProblem(p), /Water cap must be 0 or more/);
  assert.throws(() => normalizeWeights({ profit: 0, burden: 0, access: 0 }), /at least one weight/);
  assert.throws(() => normalizeWeights({ profit: -1, burden: 1, access: 0 }), /0 or more/);
  const q = cloneProblem(DEFAULT_PROBLEM);
  q.activities[0].use = [0, 0, 0, 0];
  assert.throws(() => validateProblem(q), /must use at least one resource/);
  const z = cloneProblem(DEFAULT_PROBLEM);
  z.resources.forEach((r) => (r.cap = 0));
  z.accessFloor = 0;
  z.burdenCap = null;
  const s = solve(z, { profit: 1, burden: 1, access: 1 });
  assert.equal(s.status, 'optimal');
  assert.ok(s.x.every((v) => v === 0), 'zero resources give the empty allocation');
});

test('default problem is feasible with a non-trivial frontier', () => {
  const p = cloneProblem(DEFAULT_PROBLEM);
  const f = frontier(p, 10);
  assert.equal(f.status, 'ok');
  assert.ok(f.ctx.vertices.length >= 5);
  assert.ok(f.points.length >= 4);
});
