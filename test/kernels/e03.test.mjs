import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLoom, analyticMeanNB, simulatePath, damageShare, hazardFromSweep } from '../../src/kernels/e03.js';

const C = () => ({
  paths: 1000, horizon_y: 20, freq_per_y: 0.35, severity: 0.85, variability: 0.35, correlation: 0.5, efficacy: 0.5,
  capex_usd: 400000, opex_usd_y: 10000, discount: 0.06, exposedValue_usd: 2e6, downtime_usd_h: 8000,
});

test('zero cost and zero loss give zero net benefit on every path', () => {
  const r = runLoom({ ...C(), freq_per_y: 0, capex_usd: 0, opex_usd_y: 0 }, 1);
  for (const v of r.nb) assert.equal(v, 0);
  assert.equal(r.stats.pPositive, 0);
});

test('zero efficacy with a positive cost cannot raise net benefit: every path equals −(capex + PV opex)', () => {
  const c = { ...C(), efficacy: 0 };
  const r = runLoom(c, 2);
  let pvOpex = 0;
  for (let t = 1; t <= c.horizon_y; t++) pvOpex += c.opex_usd_y / (1 + c.discount) ** t;
  for (const v of r.nb) assert.ok(Math.abs(v + c.capex_usd + pvOpex) < 1e-6);
  assert.equal(r.stats.pPositive, 0);
});

test('same seed gives the same paths; a new seed gives new ones', () => {
  const a = runLoom(C(), 7), b = runLoom(C(), 7), c = runLoom(C(), 8);
  assert.deepEqual(Array.from(a.nb), Array.from(b.nb));
  assert.notDeepEqual(Array.from(a.nb), Array.from(c.nb));
});

test('drilling into one path reproduces its value from the full run exactly', () => {
  const c = C();
  const r = runLoom(c, 11);
  for (const p of [0, 17, 999]) assert.equal(simulatePath(c, 11, p, null, true).nb, r.nb[p]);
});

test('quantiles are ordered, probabilities lie in [0, 1], everything finite at r = 0', () => {
  const r = runLoom({ ...C(), discount: 0 }, 3);
  const s = r.stats;
  assert.ok(s.q05 <= s.median && s.median <= s.q95);
  assert.ok(s.pPositive >= 0 && s.pPositive <= 1);
  for (const v of Object.values(s)) assert.ok(Number.isFinite(v));
  for (const [, a, m, b] of r.band) assert.ok(a <= m && m <= b);
});

test('expected shortfall of losses is at least the mean loss; worst-5% net benefit is at most the mean', () => {
  const s = runLoom(C(), 4).stats;
  assert.ok(s.esLossBase5 >= s.meanLossBase);
  assert.ok(s.esNB5 <= s.mean);
});

test('Monte Carlo mean matches the analytic mean for fixed severity (within 4 standard errors)', () => {
  const c = { ...C(), variability: 0, correlation: 0, paths: 8000, severity: 1 };
  const r = runLoom(c, 5);
  const exact = analyticMeanNB(c);
  assert.ok(Math.abs(r.stats.mean - exact) < 4 * r.stats.stdErrMean, `${r.stats.mean} vs ${exact} ± ${r.stats.stdErrMean}`);
});

test('damage curve: zero below 5 cm, rising, capped at 1', () => {
  assert.equal(damageShare(0.04), 0);
  assert.ok(damageShare(0.5) < damageShare(1));
  assert.equal(damageShare(50), 1);
});

test('hazard from a sweep where the wetland changes nothing gives a loss of exactly capex + PV opex', () => {
  const row = (m, d, h) => ({ multiplier: m, baseline: { hotelPeak_m: d, hotelHoursAbove: h }, intervention: { hotelPeak_m: d, hotelHoursAbove: h } });
  const hz = hazardFromSweep([row(0.4, 0.05, 0), row(0.7, 0.2, 0.5), row(1, 0.45, 3), row(1.3, 0.6, 4), row(1.6, 0.8, 5)]);
  const c = C();
  const r = runLoom(c, 6, hz);
  let pvOpex = 0;
  for (let t = 1; t <= c.horizon_y; t++) pvOpex += c.opex_usd_y / (1 + c.discount) ** t;
  for (const v of r.nb) assert.ok(Math.abs(v + c.capex_usd + pvOpex) < 1e-6);
});

test('invalid configuration is refused with a message', () => {
  assert.throws(() => runLoom({ ...C(), paths: 20000 }, 1), /paths/);
  assert.throws(() => runLoom({ ...C(), discount: -0.1 }, 1), /discount/);
});
