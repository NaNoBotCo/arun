import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paretoFront, bruteFront, dominates, search, DEFAULTS, solarYield_kWh_kWp } from '../../src/kernels/e06.js';
import { makeRng } from '../../src/core/rng.js';

const P = (id, profit, benefit, capex = 0, burden = 0) => ({ id, profit, benefit, capex, burden });

test('known 2D frontier: the staircase points survive, the dominated ones do not', () => {
  const pts = [P(1, 10, 1), P(2, 8, 4), P(3, 5, 6), P(4, 1, 9), P(5, 7, 3), P(6, 4, 4), P(7, 0, 0)];
  const ids = paretoFront(pts).map((p) => p.id).sort();
  assert.deepEqual(ids, [1, 2, 3, 4]);
});

test('a dominated point is excluded; equal points both stay (neither strictly better)', () => {
  assert.ok(dominates(P(1, 5, 5), P(2, 4, 5)));
  assert.ok(!dominates(P(1, 5, 5), P(2, 5, 5)));
  const ids = paretoFront([P(1, 5, 5), P(2, 5, 5), P(3, 4, 5)]).map((p) => p.id).sort();
  assert.deepEqual(ids, [1, 2]);
});

test('reference: the sorted-scan frontier equals the brute-force frontier on 600 random 4-objective points', () => {
  const rng = makeRng(3);
  const pts = Array.from({ length: 600 }, (_, i) => P(i, rng.normal(), rng.normal(), rng.uniform(), rng.uniform()));
  const a = paretoFront(pts).map((p) => p.id).sort((x, y) => x - y);
  const b = bruteFront(pts).map((p) => p.id).sort((x, y) => x - y);
  assert.deepEqual(a, b);
});

test('impossible constraints give an empty result, not a made-up candidate', () => {
  const r = search({ ...DEFAULTS, count: 2000, budget_usd: 0 }, 1, 48);
  assert.equal(r.feasibleCount, 0);
  assert.equal(r.frontIds.length, 0);
});

test('every frontier candidate is feasible and within the constraints', () => {
  const c = { ...DEFAULTS, count: 3000 };
  const r = search(c, 2, 48);
  assert.ok(r.frontIds.length > 0);
  const byId = new Map(r.candidates.map((x) => [x.id, x]));
  for (const id of r.frontIds) {
    const x = byId.get(id);
    assert.ok(x.feasible && x.capex <= c.budget_usd && x.payback_y <= c.maxPayback_y && x.burden <= c.maxBurden_ha);
  }
});

test('same seed reproduces the search exactly', () => {
  const a = search({ ...DEFAULTS, count: 1500 }, 5, 48), b = search({ ...DEFAULTS, count: 1500 }, 5, 48);
  assert.deepEqual(a.frontIds, b.frontIds);
});

test('solar yield from E01 geometry is plausible for 13°N (1,300–1,600 kWh per kWp per year at clearness 0.5)', () => {
  const y = solarYield_kWh_kWp(13.4, 0.5);
  assert.ok(y > 1300 && y < 1600, String(y));
});

test('invalid configuration is refused', () => {
  assert.throws(() => search({ ...DEFAULTS, count: 60000 }, 1, 48), /count/);
});
