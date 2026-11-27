import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellCount, leadCount, runsPerDay, workPerRun, workPerDay, tenantsWork, makeTenants, tierCoreHours,
  DEFAULT_INPUTS, checkInputs, costAt, costRange, tornado, placement, costPerTenant,
} from '../../src/kernels/business.js';
import { benchmark, demand } from '../../src/kernels/compute.js';

const W = { areaKm2: 4, cellM: 100, horizonMin: 120, stepMin: 2, members: 48, updateMin: 5 };

test('cells use ceil, with whole ratios stay whole', () => {
  assert.equal(cellCount(4, 100), 400);
  assert.equal(cellCount(0.1, 100), 10);
  assert.equal(cellCount(1, 300), 12);   // 11.11 rounds up
  assert.equal(cellCount(400, 100), 40000);
  assert.equal(cellCount(0.0001, 100), 1);
});
test('leads use floor plus one', () => {
  assert.equal(leadCount(120, 2), 61);
  assert.equal(leadCount(119, 2), 60);
  assert.equal(leadCount(0, 5), 1);
  assert.equal(leadCount(1, 2), 1);
});
test('work per run and per day, hand checked', () => {
  const r = workPerRun(W);
  assert.equal(r.perRun, 400 * 61 * 48);
  assert.equal(runsPerDay(5), 288);
  assert.equal(workPerDay(W).perDay, 400 * 61 * 48 * 288);
});
test('agrees with compute.js demand() on whole cases', () => {
  const d = demand({ areaKm2: 400, cellM: 100, members: 48, updateMin: 5 });
  const b = workPerDay({ areaKm2: 400, cellM: 100, horizonMin: 120, stepMin: 2, members: 48, updateMin: 5 });
  assert.equal(b.perRun, d.perRun); assert.equal(b.perDay, d.perDay);
  assert.equal(typeof benchmark, 'function');
});
test('shared tenants amortize, independent tenants add', () => {
  const one = workPerDay(W).perDay;
  const sh = tenantsWork(makeTenants(W, 10, true));
  assert.equal(sh.perDay, one); assert.equal(sh.groups.length, 1);
  assert.ok(sh.perTenant.every(p => p.shared === one / 10 && p.alone === one));
  const ind = tenantsWork(makeTenants(W, 10, false));
  assert.equal(ind.perDay, one * 10); assert.equal(ind.groups.length, 10);
  assert.ok(ind.perTenant.every(p => p.shared === p.alone));
});
test('a shared run is computed at the largest ask in the group', () => {
  const a = { ...W, id: 'a', region: 'r' }, b = { ...W, id: 'b', region: 'r', members: 96, horizonMin: 180 };
  const r = tenantsWork([a, b]);
  assert.equal(r.groups.length, 1);
  assert.equal(r.perDay, workPerDay({ ...W, members: 96, horizonMin: 180 }).perDay);
  // different cadence does not share
  assert.equal(tenantsWork([a, { ...b, updateMin: 10 }]).groups.length, 2);
});
test('tiers stay apart and core-hours are arithmetic', () => {
  const perDay = 3.6e9;
  const [p, l, s] = tierCoreHours(perDay, { overhead: 1, phonePerSec: 1e6, laptopPerSec: 2e6, serverPerSec: 4e6, serverCores: 8 });
  assert.deepEqual([p.kind, l.kind, s.kind], ['measured', 'benchmark', 'hypothetical']);
  assert.equal(p.coreHours, 1); assert.equal(l.coreHours, 0.5); assert.equal(s.coreHours, 0.25); assert.equal(s.wallHours, 0.25 / 8);
  const n = tierCoreHours(perDay, { overhead: 2, serverPerSec: 4e6 });
  assert.equal(n[0].coreHours, null); assert.equal(n[1].perSec, null); assert.equal(n[2].coreHours, 0.5);
});
test('cost: hand-checked parts', () => {
  const v = { overhead: 1, serverPerSec: 1e6, corePrice: 0.1, storageGB: 10, storagePrice: 0.5, egressGB: 20, egressPrice: 0.25, sensors: 4, ingestPrice: 2, support: 100, redundancy: 2 };
  const c = costAt(v, 3.6e9); // 1 core-hour a day, 30 a month
  assert.equal(c.coreHoursDay, 1); assert.equal(c.compute, 3); assert.equal(c.storage, 5); assert.equal(c.egress, 5);
  assert.equal(c.ingest, 8); assert.equal(c.subtotal, 121); assert.equal(c.total, 242);
});
test('range is ordered low <= mid <= high', () => {
  for (const perDay of [0, 1e6, 1e10, 1e14]) {
    const r = costRange(DEFAULT_INPUTS(), perDay);
    assert.ok(r.low.total <= r.mid.total && r.mid.total <= r.high.total, String(perDay));
  }
});
test('tornado sorted by swing, with swing equal to the gap', () => {
  const tn = tornado(DEFAULT_INPUTS(), 5e12);
  assert.equal(tn.length, Object.keys(DEFAULT_INPUTS()).length);
  for (let i = 1; i < tn.length; i++) assert.ok(tn[i - 1].swing >= tn[i].swing);
  for (const r of tn) assert.ok(Math.abs(r.swing - Math.abs(r.atHigh - r.atLow)) < 1e-9);
  const sp = tn.find(r => r.key === 'serverPerSec'); assert.ok(sp.atLow > sp.atHigh); // faster core costs less
});
test('crossover tenant count is monotone', () => {
  const f = { ...W, areaKm2: 4 };
  let prev = 0;
  for (const region of [1e6, 1e7, 1e8, 1e9]) {
    const p = placement({ facility: f, regionPerRun: region, tenants: 1, devicePerSec: 1e7 });
    assert.ok(p.crossover >= prev); prev = p.crossover;
  }
  const own = workPerRun(f).perRun;
  let last = null;
  for (let n = 1; n <= 200; n++) {
    const p = placement({ facility: f, regionPerRun: own * 50, tenants: n, devicePerSec: 1e8 });
    if (last === 'central') assert.equal(p.winner, 'central');
    last = p.winner;
  }
  const p = placement({ facility: f, regionPerRun: own * 50, tenants: 50, devicePerSec: 1e8 });
  assert.equal(p.crossover, 51); assert.equal(p.winner, 'device');
  assert.equal(placement({ facility: f, regionPerRun: own * 50, tenants: 51, devicePerSec: 1e8 }).reason, 'mc_why_shared');
});
test('placement: device fits, exceeds, unknown, independent', () => {
  const f = W, own = workPerRun(f).perRun;
  const a = placement({ facility: f, regionPerRun: own * 1000, tenants: 1, devicePerSec: own * 1.5 / 10, share: 0.5 }); // 10 s needed, 150 s budget
  assert.equal(a.fits, true); assert.equal(a.winner, 'device'); assert.equal(a.reason, 'mc_why_device');
  const b = placement({ facility: f, regionPerRun: own * 1000, tenants: 1, devicePerSec: own * 1.5 / 200 });
  assert.equal(b.fits, false); assert.equal(b.winner, 'central'); assert.equal(b.reason, 'mc_why_exceeds');
  const c = placement({ facility: f, regionPerRun: own * 1000, tenants: 1 });
  assert.equal(c.winner, null); assert.equal(c.reason, 'mc_why_nodevice');
  const d = placement({ facility: f, regionPerRun: own * 1000, tenants: 5000, shared: false, devicePerSec: own });
  assert.equal(d.crossover, Infinity); assert.equal(d.winner, 'device');
});
test('cost per tenant falls with N', () => {
  assert.ok(costPerTenant(1000, 10) < costPerTenant(1000, 5));
});
test('bad input throws', () => {
  assert.throws(() => cellCount(0, 100), RangeError);
  assert.throws(() => cellCount(4, -1), RangeError);
  assert.throws(() => cellCount(NaN, 100), RangeError);
  assert.throws(() => leadCount(-1, 2), RangeError);
  assert.throws(() => leadCount(120, 0), RangeError);
  assert.throws(() => runsPerDay(Infinity), RangeError);
  assert.throws(() => workPerRun({ ...W, members: 0 }), RangeError);
  assert.throws(() => workPerRun({ ...W, members: 2.5 }), RangeError);
  assert.throws(() => workPerDay({ ...W, updateMin: '5' }), RangeError);
  assert.throws(() => tenantsWork([]), RangeError);
  assert.throws(() => tierCoreHours(1e9, { overhead: 0, serverPerSec: 1 }), RangeError);
  assert.throws(() => tierCoreHours(1e9, { overhead: 1, serverPerSec: 1, phonePerSec: -3 }), RangeError);
  const inp = DEFAULT_INPUTS(); inp.corePrice.low = 1;
  assert.throws(() => checkInputs(inp), RangeError);
  const inp2 = DEFAULT_INPUTS(); inp2.redundancy.low = 0.5;
  assert.throws(() => costRange(inp2, 1e9), RangeError);
  assert.throws(() => placement({ facility: W, regionPerRun: 1e6, tenants: 0 }), RangeError);
  assert.throws(() => placement({ facility: W, regionPerRun: 1e6, tenants: 1, share: 2 }), RangeError);
});
