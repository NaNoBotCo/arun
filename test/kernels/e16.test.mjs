import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, decompose, laggedCorrelation, anomalyIntervals, fitOLS, toTable, validate, DEFAULTS, DAYS, jobs } from '../../src/kernels/e16.js';
import { makeRng } from '../../src/core/rng.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);

test('exports an empty jobs object', () => {
  assert.deepEqual(jobs, {});
});

test('time split is chronological: forecasts exist only after trainEnd, in increasing order', () => {
  for (const aggDays of [1, 7, 14]) {
    const r = run({ ...DEFAULTS, aggDays }, 11);
    assert.ok(r.ok, r.reason);
    assert.ok(r.forecast.index.every((t) => t >= r.trainEnd));
    for (let i = 1; i < r.forecast.index.length; i++) assert.ok(r.forecast.index[i] > r.forecast.index[i - 1]);
    assert.equal(r.trainEnd, Math.floor(r.nb * r.config.trainShare));
  }
});

test('no future leakage: changing every test-period value leaves the fit unchanged (exact)', () => {
  const a = run(DEFAULTS, 5);
  // Rebuild the same series, then corrupt everything at or after trainEnd and refit through the public evaluator.
  const { evaluateForecast } = await_import();
  const s2 = { ...a.series };
  for (const k of ['deliveries', 'cost', 'supply', 'weather']) {
    s2[k] = Float64Array.from(a.series[k]);
    for (let t = a.trainEnd; t < a.nb; t++) s2[k][t] = s2[k][t] * 3 + 17;
  }
  const b = evaluateForecast(s2, 'deliveries', a.config, a.trainEnd, a.disruptionBins);
  assert.deepEqual(b.coefficients.standardised, a.forecast.coefficients.standardised);
  assert.equal(b.coefficients.intercept, a.forecast.coefficients.intercept);
  assert.deepEqual(b.profile, a.forecast.profile);
  assert.equal(b.lag, a.forecast.lag);
  assert.equal(b.trainSd, a.forecast.trainSd);
});
import * as K from '../../src/kernels/e16.js';
function await_import() {
  return K;
}

test('lagged correlation finds the planted lag (exact, noiseless)', () => {
  const rng = makeRng(3);
  const n = 400;
  const x = Float64Array.from({ length: n }, () => rng.normal());
  const y = new Float64Array(n);
  for (let t = 0; t < n; t++) y[t] = t >= 4 ? 2 * x[t - 4] : 0;
  const c = laggedCorrelation(x, y, 8);
  const best = c.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a));
  assert.equal(best.lag, 4);
  near(best.r, 1, 0.02);
});

test('correlation is not causation: a shared seasonal cycle gives high raw correlation, near zero after decomposition', () => {
  const rng = makeRng(8);
  const n = 7 * 120;
  const a = new Float64Array(n), b = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const season = Math.sin((2 * Math.PI * t) / 7);
    a[t] = 10 + 4 * season + 0.4 * rng.normal();
    b[t] = 3 - 2 * season + 0.4 * rng.normal(); // no link to a except the shared cycle
  }
  const raw = laggedCorrelation(a, b, 0)[0].r;
  const da = decompose(a, 7).remainder;
  const db = decompose(b, 7).remainder;
  const adj = laggedCorrelation(da, db, 0)[0].r;
  assert.ok(Math.abs(raw) > 0.7, `raw ${raw}`);
  assert.ok(Math.abs(adj) < 0.2, `adjusted ${adj}`);
  const r = run(DEFAULTS, 2);
  assert.ok(r.notes.some((s) => /not a cause/.test(s)));
});

test('decomposition recovers a planted weekly profile and linear trend (tolerance 1e-9, interior)', () => {
  const prof = [3, -1, 0, 2, -4, 1, -1];
  const m = prof.reduce((a, v) => a + v, 0) / 7;
  const n = 70;
  const y = Float64Array.from({ length: n }, (_, t) => 100 + 0.5 * t + prof[t % 7]);
  const d = decompose(y, 7);
  for (let k = 0; k < 7; k++) near(d.profile[k], prof[k] - m, 1e-9, 'profile');
  for (let i = 3; i < n - 3; i++) {
    near(d.remainder[i], 0, 1e-9, 'remainder');
    near(d.trend[i], 100 + 0.5 * i + m, 1e-9, 'trend');
  }
  assert.ok(Number.isNaN(d.trend[0]) && Number.isNaN(d.trend[n - 1]));
});

test('even-period decomposition (period 4) also recovers a noiseless pattern', () => {
  const prof = [2, -2, 1, -1];
  const y = Float64Array.from({ length: 48 }, (_, t) => 10 + 0.25 * t + prof[t % 4]);
  const d = decompose(y, 4);
  for (let i = 2; i < 46; i++) near(d.remainder[i], 0, 1e-9);
});

test('missing data is flagged and never filled', () => {
  const r = run({ ...DEFAULTS, missingness: 0.3 }, 4);
  assert.ok(r.missingBins.length > 100);
  for (const b of r.missingBins) assert.ok(Number.isNaN(r.series.deliveries[b]));
  const t = toTable(r);
  const missCol = t.columns.indexOf('missing');
  assert.equal(t.rows.filter((row) => row[missCol] === 1).length, r.missingBins.length);
  assert.ok(t.rows.filter((row) => row[missCol] === 1).every((row) => row[2] === null));
  // Scored + skipped covers every test bin.
  assert.equal(r.forecast.scored + r.forecast.skipped, r.nb - r.trainEnd);
});

test('very high missingness stops with a stated reason instead of a number', () => {
  const r = run({ ...DEFAULTS, missingness: 0.9 }, 4);
  assert.equal(r.ok, false);
  assert.match(r.reason, /missingness|complete|observed/i);
});

test('anomaly intervals: a planted block is found as one interval, none in clean noise', () => {
  const rng = makeRng(9);
  const rem = Float64Array.from({ length: 300 }, () => rng.normal());
  for (let i = 120; i < 130; i++) rem[i] += 12;
  const an = anomalyIntervals(rem, 4);
  assert.equal(an.intervals.length, 1);
  assert.equal(an.intervals[0].start, 120);
  assert.equal(an.intervals[0].end, 129);
  const clean = anomalyIntervals(Float64Array.from({ length: 300 }, () => rng.normal()), 5);
  assert.equal(clean.intervals.length, 0);
});

test('a supply disruption in the test period is flagged as an anomaly and raises regression error inside it', () => {
  const r = run({ ...DEFAULTS, disruptionDepth: 0.7, noise: 0.2 }, 21);
  assert.ok(r.ok);
  assert.equal(r.disruptionDetected, true);
  assert.ok(r.forecast.scores.regression.inside > r.forecast.scores.regression.outside);
  const none = run({ ...DEFAULTS, disruptionDepth: 0 }, 21);
  assert.equal(none.disruptionDetected, null);
});

test('OLS matches a hand-solved case: y = 2 + 3x exactly, and 2x2 normal equations', () => {
  const rows = [[1, 0], [1, 1], [1, 2], [1, 3]];
  const c = fitOLS(rows, [2, 5, 8, 11]);
  near(c[0], 2, 1e-12);
  near(c[1], 3, 1e-12);
  // x = 0,1,2 ; y = 1,3,2 -> slope = 0.5, intercept = 1.3333333333 (by hand: Sxy=1, Sxx=2, mean y=2, mean x=1)
  const d = fitOLS([[1, 0], [1, 1], [1, 2]], [1, 3, 2]);
  near(d[1], 0.5, 1e-12);
  near(d[0], 2 - 0.5, 1e-12);
  assert.equal(fitOLS([[1, 0], [1, 0]], [1, 2]), null);
});

test('reported errors equal an independent recomputation from the forecast arrays', () => {
  const r = run(DEFAULTS, 6);
  const f = r.forecast;
  const rm = (pred) => Math.sqrt(pred.reduce((s, v, i) => s + (v - f.actual[i]) ** 2, 0) / pred.length);
  near(f.scores.naive.rmse, rm(f.naive), 1e-9);
  near(f.scores.seasonal.rmse, rm(f.seasonal), 1e-9);
  near(f.scores.regression.rmse, rm(f.regression), 1e-9);
  // Naive forecast is the previous observed bin.
  f.index.slice(0, 20).forEach((t, i) => assert.equal(f.naive[i], r.series.deliveries[t - 1]));
  f.index.slice(0, 20).forEach((t, i) => assert.equal(f.seasonal[i], r.series.deliveries[t - r.period]));
});

test('regression beats both baselines with weather and supply signal at default settings', () => {
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = run(DEFAULTS, seed);
    if (r.forecast.skill > 0) wins++;
  }
  assert.ok(wins >= 4, `wins ${wins}`);
});

test('weekly aggregation shrinks the series and uses an annual period', () => {
  const r = run({ ...DEFAULTS, aggDays: 7 }, 1);
  assert.equal(r.nb, Math.floor(DAYS / 7));
  assert.equal(r.period, 52);
  assert.equal(toTable(r).rows.length, r.nb);
});

test('export table holds aggregate columns only', () => {
  const t = toTable(run(DEFAULTS, 1));
  assert.deepEqual(t.columns, ['bin', 'day_start', 'deliveries_k', 'cost_usd_per_delivery', 'weather_index', 'supply_index', 'coverage', 'missing', 'split']);
  assert.ok(t.rows.length <= DAYS);
});

test('seeded reproducibility: same seed gives identical output, other seeds differ', () => {
  const a = run(DEFAULTS, 77);
  const b = run(DEFAULTS, 77);
  assert.deepEqual(Array.from(a.series.deliveries), Array.from(b.series.deliveries));
  assert.deepEqual(a.forecast.regression, b.forecast.regression);
  assert.deepEqual(a.anomalies.intervals, b.anomalies.intervals);
  const c = run(DEFAULTS, 78);
  assert.notDeepEqual(Array.from(a.series.deliveries), Array.from(c.series.deliveries));
});

test('weather draws do not change when only noise changes (separate streams)', () => {
  const a = run({ ...DEFAULTS, noise: 0.1 }, 3);
  const b = run({ ...DEFAULTS, noise: 0.9 }, 3);
  assert.deepEqual(Array.from(a.series.weather), Array.from(b.series.weather));
});

test('out-of-range input throws a plain message', () => {
  assert.throws(() => validate({ noise: 2 }), /noise must be between 0 and 1/);
  assert.throws(() => validate({ aggDays: 3 }), /aggDays must be 1, 7 or 14/);
  assert.throws(() => run({ missingness: NaN }, 1), /missingness/);
});

test('all outputs are finite where defined', () => {
  const r = run({ ...DEFAULTS, target: 'cost' }, 9);
  assert.ok(r.ok);
  for (const k of ['rmse', 'mae']) for (const m of ['naive', 'seasonal', 'regression']) assert.ok(Number.isFinite(r.forecast.scores[m][k]));
  assert.ok(r.forecast.coverage80 > 0.3 && r.forecast.coverage80 <= 1);
});
