import { test } from 'node:test';
import assert from 'node:assert/strict';
import { economics, sensitivity, measuredCpuHours } from '../../src/kernels/e07.js';

const P = (o = {}) => ({ reportsPerYear: 200, pricePerCredit_usd: 400, level: 'standard', cpuHoursPerReport: 30, cpuCost_usd_h: 0.08, storage_usd: 5, field_usd: 150, fixed_usd_y: 60000, ...o });

test('hand-worked case: revenue, variable cost, contribution, margin and break-even', () => {
  const e = economics(P());
  assert.equal(e.price, 1200);
  assert.equal(e.revenue, 240000);
  assert.ok(Math.abs(e.variablePerReport - (30 * 0.08 + 5 + 150)) < 1e-9);
  assert.ok(Math.abs(e.contribution - (240000 - 200 * 157.4)) < 1e-6);
  assert.ok(Math.abs(e.margin - e.contribution / 240000) < 1e-12);
  assert.equal(e.breakEvenReports, Math.ceil(60000 / (1200 - 157.4)));
});

test('zero jobs means zero usage charge and zero compute hours', () => {
  const e = economics(P({ reportsPerYear: 0 }));
  assert.equal(e.variable, 0);
  assert.equal(e.cpuHours, 0);
  assert.equal(e.revenuePerCpuHour, null);
  assert.equal(measuredCpuHours([], 0).cpuHours, 0);
});

test('zero revenue: margin is not a number we invent; it is null', () => {
  const e = economics(P({ pricePerCredit_usd: 0 }));
  assert.equal(e.revenue, 0);
  assert.equal(e.margin, null);
  assert.ok(e.contribution < 0);
});

test('a price below variable cost never breaks even', () => {
  const e = economics(P({ pricePerCredit_usd: 10 }));
  assert.equal(e.breakEvenReports, null);
});

test('sensitivity: price up raises contribution, field cost up lowers it', () => {
  const s = Object.fromEntries(sensitivity(P()).map((r) => [r.key, r]));
  assert.ok(s.pricePerCredit_usd.high > 0 && s.pricePerCredit_usd.low < 0);
  assert.ok(s.field_usd.high < 0 && s.field_usd.low > 0);
});

test('measured compute converts milliseconds to hours, scaled only by the stated factor', () => {
  const m = measuredCpuHours([{ elapsedMs: 1800000 }, { elapsedMs: 1800000 }], 0, 1);
  assert.ok(Math.abs(m.cpuHours - 1) < 1e-12);
  assert.ok(Math.abs(measuredCpuHours([{ elapsedMs: 3.6e6 }], 0, 100).cpuHours - 100) < 1e-9);
});

test('invalid inputs are refused', () => {
  assert.throws(() => economics(P({ reportsPerYear: -1 })), /reportsPerYear/);
  assert.throws(() => economics(P({ level: 'gold' })), /level/);
});
