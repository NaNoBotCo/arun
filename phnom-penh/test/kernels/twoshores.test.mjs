import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, makeReplicate, fitArms, scoreArms, normalizeSettings, availability, provenance, fit, predict, genCases, TEST_N, ARMS } from '../../src/kernels/twoshores.js';

test('same seed, same results; a different seed differs', () => {
  const a = run({ seed: 3, replicates: 8 }), b = run({ seed: 3, replicates: 8 }), c = run({ seed: 4, replicates: 8 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.sides.pp.local.mae, c.sides.pp.local.mae);
});

test('a longer training run extends a shorter one; withheld cases do not depend on training size', () => {
  const a = genCases('pp', 1, 7, 0, 'train', 20), b = genCases('pp', 1, 7, 0, 'train', 60);
  assert.deepEqual(a, b.slice(0, 20));
  const r1 = makeReplicate({ pp: { n: 10 } }, 2), r2 = makeReplicate({ pp: { n: 100 } }, 2);
  assert.deepEqual(r1.pp.test, r2.pp.test);
  assert.equal(r1.pp.test.length, TEST_N);
});

test('withheld cases are never used for fitting: changing their labels leaves every model unchanged', () => {
  const s = normalizeSettings({});
  const rep = makeReplicate(s, 1), before = fitArms(rep, s), scoreBefore = scoreArms(before, rep);
  const tampered = structuredClone(rep);
  for (const side of ['cm', 'pp']) for (const r of tampered[side].test) { r.g = r.g * 3 + 40; r.c = r.c + 9; }
  const after = fitArms(tampered, s);
  assert.deepEqual(after, before);
  assert.notDeepEqual(scoreArms(after, tampered).pp.local.mae, scoreBefore.pp.local.mae);
});

test('changing training labels does change the fits', () => {
  const s = normalizeSettings({}), rep = makeReplicate(s, 1), before = fitArms(rep, s);
  const t2 = structuredClone(rep); for (const r of t2.pp.train) r.g += 5;
  assert.notDeepEqual(fitArms(t2, s).pp.local, before.pp.local);
});

test('parameter transfer is worse than local-only on the Chiang Mai side at the defaults', () => {
  const r = run({ replicates: 40 }).sides.cm.arms.params;
  assert.ok(r.available && r.negative && r.benefit.median < -0.2, JSON.stringify(r.benefit));
  assert.ok(r.worseShare > 0.8);
});

test('method transfer helps the side with fewer cases, and is negative for the side with the better procedure', () => {
  const r = run({ replicates: 40 }), pp = r.sides.pp.arms.method, cm = r.sides.cm.arms.method;
  assert.ok(r.settings.pp.n < r.settings.cm.n);
  assert.ok(pp.benefit.median > 1 && pp.worseShare < 0.1, JSON.stringify(pp.benefit));
  assert.ok(cm.negative, JSON.stringify(cm.benefit));
});

test('pooling hurts or helps depending on settings', () => {
  const plain = a => run(a).sides.cm.arms.pooled.benefit.median;
  assert.ok(plain({ gap: 1, pp: { n: 80 } }) < -0.1);     // different cameras, plenty of foreign cases
  assert.ok(Math.abs(plain({ gap: 0, pp: { n: 80 } })) < 0.1);
  assert.ok(run({ gap: 0 }).sides.pp.arms.pooled.benefit.median > 0.3);  // same cameras, more cases help the small side
});

test('unequal gains: the two sides do not move together', () => {
  const r = run({});
  assert.ok(r.sides.pp.arms.method.benefit.median > 0 && r.sides.cm.arms.method.benefit.median < 0);
});

test('opting out removes the arm; the other side has its own', () => {
  const r = run({ replicates: 6, cm: { shareMethod: false } });
  assert.equal(r.sides.pp.arms.method.available, false);
  assert.deepEqual(r.sides.pp.arms.method.missing, { needs: 'cm', what: 'method' });
  assert.equal(r.sides.cm.arms.method.available, true);
  const p = run({ replicates: 6, pp: { shareObs: false } });
  for (const side of ['cm', 'pp']) { assert.equal(p.sides[side].arms.pooled.available, false); assert.equal(p.sides[side].arms.pooledSide.available, false); assert.deepEqual(p.sides[side].arms.pooled.missing.needs, ['pp']); }
  const q = run({ replicates: 6, cm: { shareParams: false } });
  assert.equal(q.sides.pp.arms.params.available, false);
  assert.equal(q.sides.cm.arms.params.available, true);
  const none = availability({ cm: { shareObs: false, shareMethod: false, shareParams: false }, pp: { shareObs: false, shareMethod: false, shareParams: false } });
  for (const side of ['cm', 'pp']) for (const a of ARMS) assert.ok(none[side][a]);
});

test('provenance lists side and count for every model', () => {
  const p = provenance({ cm: { n: 50 }, pp: { n: 12 } }, 'pp');
  assert.deepEqual(p.local.records, [{ side: 'pp', n: 12 }]);
  assert.deepEqual(p.method.records, [{ side: 'pp', n: 12 }]);
  assert.equal(p.method.procFrom, 'cm');
  assert.deepEqual(p.params.records, [{ side: 'cm', n: 50 }]);
  assert.deepEqual(p.pooled.records, [{ side: 'pp', n: 12 }, { side: 'cm', n: 50 }]);
});

test('benefit is local-only error minus arm error, with a spread and a worse share', () => {
  const r = run({ replicates: 20 }).sides.pp;
  const m = r.arms.method;
  assert.ok(m.benefit.p10 <= m.benefit.median && m.benefit.median <= m.benefit.p90);
  assert.ok(Math.abs((r.local.mae.median - m.mae.median) - m.benefit.median) < 1.5);
  assert.ok(m.worseShare >= 0 && m.worseShare <= 1);
});

test('fits recover a known relation', () => {
  const rows = []; for (let i = 0; i < 200; i++) { const c = 1 + i * 0.4; rows.push({ c, g: 2 * c, night: 0 }); }
  assert.ok(Math.abs(fit('scale', rows).coef.k - 2) < 1e-9);
  const m = fit('logNight', rows.map((r, i) => ({ ...r, night: i % 2 }))); assert.ok(predict(m, rows[50]) > 0);
});

test('bad inputs throw', () => {
  assert.throws(() => run({ replicates: 0 }), RangeError);
  assert.throws(() => run({ replicates: 2.5 }), RangeError);
  assert.throws(() => run({ gap: -1 }), RangeError);
  assert.throws(() => run({ gap: NaN }), RangeError);
  assert.throws(() => run({ cm: { n: 3 } }), RangeError);
  assert.throws(() => run({ pp: { n: '20' } }), RangeError);
  assert.throws(() => run({ pp: { shareObs: 1 } }), TypeError);
  assert.throws(() => run({ pp: { shareNothing: true } }), RangeError);
  assert.throws(() => run({ bogus: 1 }), RangeError);
  assert.throws(() => run(null), TypeError);
  assert.throws(() => run({ cm: null }), TypeError);
  assert.throws(() => fit('nope', [{}, {}, {}]), RangeError);
  assert.throws(() => fit('scale', [{ g: 1, c: 1, night: 0 }]), RangeError);
  assert.throws(() => fit('scale', [{ g: NaN, c: 1, night: 0 }, { g: 1, c: 1, night: 0 }, { g: 1, c: 1, night: 0 }]), TypeError);
});
