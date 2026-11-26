import { test } from 'node:test';
import assert from 'node:assert/strict';
import { population, Ledger, release, trueCounts, checkReleaseSchema, TOTAL_EPSILON } from '../../src/kernels/e05.js';
import { makeRng } from '../../src/core/rng.js';
import { mean, variance } from '../../src/core/stats.js';

const pop = population(1, 5000);

test('each fictional person contributes to exactly one cell (L1 sensitivity 1)', () => {
  assert.equal(pop.cells.reduce((a, b) => a + b, 0), 5000);
  assert.equal(pop.members.length, 5000);
  for (const g of ['district', 'band', 'district×band']) assert.equal(trueCounts(pop, g).reduce((s, b) => s + b.count, 0), 5000);
});

test('basic composition is exact: three ε = 1 releases spend the whole budget; a fourth is refused', () => {
  const L = new Ledger();
  for (const g of ['district', 'band', 'district×band']) assert.ok(release(pop, L, { groupBy: g, epsilon: 1 }, 9).ok);
  assert.equal(L.spent, TOTAL_EPSILON);
  const fourth = release(pop, L, { groupBy: 'district', epsilon: 0.5 }, 9);
  assert.equal(fourth.ok, false);
  assert.match(fourth.reason, /Budget/);
});

test('a canonical duplicate returns the same answer and spends nothing more', () => {
  const L = new Ledger();
  const a = release(pop, L, { groupBy: 'district', epsilon: 0.5 }, 9);
  const b = release(pop, L, { groupBy: 'district', epsilon: 0.5000001 }, 9);
  assert.ok(b.duplicate);
  assert.deepEqual(a.release, b.release);
  assert.equal(L.spent, 0.5);
});

test('simultaneous requests cannot overspend', async () => {
  const L = new Ledger();
  const groups = ['district', 'band', 'district×band', 'district', 'band'];
  const eps = [1, 1, 1, 0.9, 0.8];
  const results = await Promise.all(groups.map((g, i) => Promise.resolve().then(() => release(pop, L, { groupBy: g, epsilon: eps[i] }, 9))));
  assert.ok(L.spent <= TOTAL_EPSILON + 1e-12);
  assert.equal(L.reserved, 0);
  assert.ok(results.filter((r) => r.ok && !r.duplicate).length <= 3);
});

test('reserve-then-commit: two reservations racing for the last budget, only one succeeds', () => {
  const L = new Ledger(1);
  const a = L.reserve('a', 0.7), b = L.reserve('b', 0.7);
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
});

test('a new fictional experiment is a new scope with a full budget', () => {
  const L1 = new Ledger(3, 'scope-1');
  release(pop, L1, { groupBy: 'district', epsilon: 1 }, 9);
  const L2 = new Ledger(3, 'scope-2');
  assert.equal(L2.remaining(), 3);
});

test('Laplace noise: mean ≈ 0 and variance ≈ 2/ε² over 200,000 draws (±3%)', () => {
  const rng = makeRng(42);
  for (const eps of [0.25, 1]) {
    const b = 1 / eps;
    const xs = Array.from({ length: 200000 }, () => rng.laplace(b));
    assert.ok(Math.abs(mean(xs)) < 0.02 * b * 3);
    const v = variance(xs);
    assert.ok(Math.abs(v - 2 / (eps * eps)) < 0.03 * (2 / (eps * eps)), `var ${v}`);
  }
});

test('refusals come from fixed public rules, before any noise or spending', () => {
  const L = new Ledger();
  for (const g of ['village', 'religion', 'ethnicity', 'household', 'anything']) {
    const r = release(pop, L, { groupBy: g, epsilon: 0.5 }, 9);
    assert.equal(r.ok, false);
  }
  assert.equal(L.spent, 0);
  assert.equal(release(pop, L, { groupBy: 'district', epsilon: 5 }, 9).ok, false);
  assert.equal(release(pop, null, { groupBy: 'district', epsilon: 0.5 }, 9).ok, false);
});

test('released output has only allowlisted fields and no identifiers', () => {
  const L = new Ledger();
  const r = release(pop, L, { groupBy: 'district×band', epsilon: 0.3 }, 9);
  assert.ok(checkReleaseSchema(r.release));
  const text = JSON.stringify(r.release);
  assert.ok(!/"id"|member|person|name"/i.test(text));
  for (const b of r.release.bins) assert.ok(b.noisyCount >= 0);
});

test('same seed, same scope, same query: same noisy answer', () => {
  const a = release(pop, new Ledger(), { groupBy: 'band', epsilon: 0.4 }, 5).release;
  const b = release(pop, new Ledger(), { groupBy: 'band', epsilon: 0.4 }, 5).release;
  assert.deepEqual(a, b);
});
