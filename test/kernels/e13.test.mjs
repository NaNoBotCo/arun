import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFit, makeTruth, gpFit, gpPredict, gpLoo, buildPredictor, testPoints, randomSequence, compareSampling, PRIOR, jobs, validate, kFoldRmse } from '../../src/kernels/e13.js';

const base = { method: 'gp', placement: 'random', n: 30, noise_sd_m: 0.3, ell_km: 1.6, reg: -2, idw_power: 2, roughness: 1.5, G: 24 };

test('constant truth, no noise: every method reconstructs it (tolerance 0.02 m)', () => {
  for (const method of ['idw', 'gp', 'rbf']) {
    const r = runFit({ ...base, method, noise_sd_m: 0, reg: -6, constantTruth: true, n: 20 }, 3);
    assert.ok(r.ok, method);
    assert.ok(r.metrics.rmse_test < 0.02, `${method} ${r.metrics.rmse_test}`);
  }
});

test('no data returns the documented prior: mean 20 m, sd 4 m', () => {
  for (const method of ['idw', 'gp', 'rbf']) {
    const r = runFit({ ...base, method, n: 0 }, 1);
    assert.ok(r.ok);
    for (const v of r.mean) assert.equal(v, PRIOR.mean_m);
    if (method === 'gp') for (const v of r.sd) assert.ok(Math.abs(v - PRIOR.sd_m) < 1e-12);
    else assert.equal(r.sd, null);
  }
});

test('posterior sd is nonnegative, at most the prior, and small at a noiseless sample', () => {
  const r = runFit({ ...base, noise_sd_m: 0 }, 5);
  for (const v of r.sd) assert.ok(v >= 0 && v <= PRIOR.sd_m + 1e-9);
  const m = gpFit(r.samples.map((s) => [s[0], s[1]]), r.samples.map((s) => s[2]), { ...base, noise_sd_m: 0 });
  const s0 = r.samples[0];
  assert.ok(Math.sqrt(gpPredict(m, s0[0], s0[1]).var) < 0.01);
});

test('reference: GP posterior equals the closed form for one sample (1e-9)', () => {
  const X = [[5, 5]], y = [23], ell = 1.5, sn = 0.5;
  const m = gpFit(X, y, { ell_km: ell, noise_sd_m: sn });
  const q = [5.8, 5.3];
  const k = 16 * Math.exp(-((q[0] - 5) ** 2 + (q[1] - 5) ** 2) / (2 * ell * ell));
  const den = 16 + sn * sn + 1e-6 * 16;
  const mean = 20 + (k / den) * 3, v = 16 - (k * k) / den;
  const p = gpPredict(m, q[0], q[1]);
  assert.ok(Math.abs(p.mean - mean) < 1e-9 && Math.abs(p.var - v) < 1e-9);
});

test('reference: closed-form leave-one-out equals brute-force refits (1e-8)', () => {
  const X = randomSequence(2, 12), T = makeTruth(2, 1.5);
  const y = X.map((p) => T.at(p[0], p[1]));
  const cfg = { ell_km: 1.5, noise_sd_m: 0.4 };
  const loo = gpLoo(gpFit(X, y, cfg), y);
  let se = 0;
  for (let i = 0; i < X.length; i++) {
    const Xi = X.filter((_, j) => j !== i), yi = y.filter((_, j) => j !== i);
    se += (gpPredict(gpFit(Xi, yi, cfg), X[i][0], X[i][1]).mean - y[i]) ** 2;
  }
  assert.ok(Math.abs(loo.rmse - Math.sqrt(se / X.length)) < 1e-8);
});

test('no test leakage: test-point points are a separate stream and predictions never read truth there', () => {
  const tp = testPoints(9), tr = randomSequence(9, 150);
  for (const t of tp) for (const s of tr) assert.ok(Math.hypot(t[0] - s[0], t[1] - s[1]) > 0);
  const real = makeTruth(9, 1.5);
  const key = new Set(tp.map((p) => p.join(',')));
  const spy = { at: (x, y) => (key.has([x, y].join(',')) ? NaN : real.at(x, y)) };
  const a = runFit(base, 9), b = runFit(base, 9, null, spy);
  assert.deepEqual(Array.from(a.mean), Array.from(b.mean));
  assert.ok(Number.isNaN(b.metrics.rmse_test));
});

test('IDW returns the sample value at a sample; RBF with tiny ridge interpolates', () => {
  const X = [[1, 1], [4, 2], [7, 8]], y = [18, 25, 21];
  const idw = buildPredictor('idw', X, y, { idw_power: 2 });
  assert.equal(idw.predict(4, 2).mean, 25);
  const rbf = buildPredictor('rbf', X, y, { ell_km: 2, reg: -8 });
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(rbf.predict(X[i][0], X[i][1]).mean - y[i]) < 1e-4);
});

test('more samples lower test-point error on average (GP, 6 seeds, no noise)', () => {
  let few = 0, many = 0;
  for (let s = 1; s <= 6; s++) {
    few += runFit({ ...base, noise_sd_m: 0.1, n: 8 }, s).metrics.rmse_test;
    many += runFit({ ...base, noise_sd_m: 0.1, n: 60 }, s).metrics.rmse_test;
  }
  assert.ok(many < few);
});

test('clustered placement is worse than random placement on test-point error (6 seeds)', () => {
  let c = 0, r = 0;
  for (let s = 1; s <= 6; s++) {
    c += runFit({ ...base, placement: 'clustered' }, s).metrics.rmse_test;
    r += runFit({ ...base, placement: 'random' }, s).metrics.rmse_test;
  }
  assert.ok(c > r, `${c} ${r}`);
});

test('random vs adaptive over repeated seeds: reproducible, finite, reported as measured', () => {
  const p = { ell_km: 1.6, noise_sd_m: 0.3, roughness: 1.5, seed: 4, nSeeds: 4, nMax: 20 };
  const a = compareSampling(p), b = compareSampling(p);
  assert.deepEqual(a, b);
  assert.equal(a.random.length, a.checks.length);
  for (const r of [...a.random, ...a.adaptive]) assert.ok(Number.isFinite(r.mean) && r.mean > 0);
  assert.ok(a.wins >= 0 && a.wins <= 4);
});

test('seeded reproducibility and seed sensitivity', () => {
  const a = runFit(base, 7), b = runFit(base, 7), c = runFit(base, 8);
  assert.deepEqual(Array.from(a.mean), Array.from(b.mean));
  assert.notDeepEqual(Array.from(a.mean), Array.from(c.mean));
  assert.equal(a.metrics.rmse_test, b.metrics.rmse_test);
});

test('uncertainty is justified at a fitted length scale and refused when over-confident (seed 12, 40 samples)', () => {
  const ok = runFit({ ...base, n: 40, ell_km: 1.6 }, 12).metrics;
  assert.equal(ok.justified, true);
  const bad = runFit({ ...base, n: 40, ell_km: 5 }, 12).metrics;
  assert.equal(bad.justified, false);
  assert.ok(bad.loo_coverage95 < 0.85 && bad.coverage95_test < 0.6, `${bad.loo_coverage95} ${bad.coverage95_test}`);
  assert.ok(ok.cv_rmse > 0);
});

test('invalid input throws plain messages; singular system reports instead of guessing', () => {
  assert.throws(() => validate({ ...base, n: -1 }), /n must be between 0 and 150/);
  assert.throws(() => validate({ ...base, method: 'x' }), /method must be/);
  assert.throws(() => validate({ ...base, noise_sd_m: NaN }), /noise_sd_m/);
  const dup = [[1, 1], [1, 1], [1, 1]];
  const m = gpFit(dup, [1, 2, 3], { ell_km: 6, noise_sd_m: 0 });
  assert.ok(m.ok === true || /positive definite/.test(m.reason));
  assert.equal(typeof jobs['e13.fit'], 'function');
  assert.ok(kFoldRmse('idw', randomSequence(1, 20), new Array(20).fill(20), { idw_power: 2 }, 1) < 1e-9);
});
