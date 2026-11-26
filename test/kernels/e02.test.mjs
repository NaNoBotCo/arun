import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRegion, createSim, runPair, hazardCurve } from '../../src/kernels/e02.js';
import { defaultScenario } from '../../src/core/scenario.js';

const P = () => ({ ...defaultScenario().hydro, simHours: 10 });

// A simple region: a plane tilted toward the south edge, no noise, one channel column.
function plane(N = 32, slope = 0.01, flat = false) {
  const z = new Float64Array(N * N);
  const zeros = () => new Float64Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) z[y * N + x] = flat ? 10 : 10 + slope * 100 * (N - 1 - y) + 0.2 * Math.abs(x - N / 2);
  const forest = zeros().fill(1);
  return {
    seed: 1, N, cellSize_m: 100, z, urban: zeros(), farm: zeros(), forest, channel: new Uint8Array(N * N),
    assets: [{ id: 'hotel', label: 'probe', threshold_m: 0.05, cell: (N - 3) * N + Math.round(N / 2) }],
    sensors: [], inflowCell: Math.round(N / 2), outletCell: (N - 1) * N + Math.round(N / 2),
  };
}

test('no rain and no inflow: no water appears', () => {
  const p = { ...P(), stormIntensity_mm_h: 0, inflow_m3_s: 0 };
  const sim = createSim(makeRegion(3, 48), p, true);
  sim.runToEnd();
  assert.equal(sim.surfaceVolume(), 0);
  const b = sim.budget();
  assert.equal(b.input, 0);
  assert.equal(b.outflow, 0);
});

test('depths stay non-negative and finite through a storm', () => {
  const sim = createSim(makeRegion(5, 48), { ...P(), stormIntensity_mm_h: 90 }, true);
  while (!sim.done) {
    sim.step(50);
    for (const v of sim.h) assert.ok(v >= 0 && Number.isFinite(v));
  }
  assert.equal(sim.state.failed, null);
});

test('mass balance residual ≤ max(1e-6 m³, 0.1% of input) on the benchmark storm, both arms', () => {
  const { base, alt } = runPair(20261125, { ...P(), simHours: 12 }, 64);
  for (const sim of [base, alt]) {
    const b = sim.budget();
    assert.ok(b.input > 0);
    assert.ok(Math.abs(b.residual) <= b.tolerance, `residual ${b.residual} m³ vs tolerance ${b.tolerance}`);
  }
});

test('analytic reference: flat ground, rain above infiltration → centre depth = (rain − infiltration)·t within 0.1% (edge drainage reaches the centre slowly)', () => {
  const region = plane(40, 0, true);
  const p = { ...P(), stormIntensity_mm_h: 60, inflow_m3_s: 0, stormDuration_h: 2, simHours: 2, timestep_s: 10, retentionCapacity_m3: 0 };
  const sim = createSim(region, p, false);
  sim.step(360); // 1 hour
  const centre = 20 * 40 + 20;
  const infil_mm_h = 22 * (1 - 0.04);
  const expect = ((60 - infil_mm_h) / 1000) * 1; // m after 1 h
  assert.ok(Math.abs(sim.h[centre] - expect) < 1e-3 * expect, `${sim.h[centre]} vs ${expect}`);
  // Total water balance holds exactly on the same run.
  const b = sim.budget();
  assert.ok(Math.abs(b.residual) <= b.tolerance);
});

test('analytic reference: rain below infiltration capacity is fully absorbed', () => {
  const region = plane(24, 0.01);
  const p = { ...P(), stormIntensity_mm_h: 10, inflow_m3_s: 0, stormDuration_h: 2, simHours: 3, retentionCapacity_m3: 0 };
  const sim = createSim(region, p, false);
  sim.runToEnd();
  const b = sim.budget();
  assert.ok(Math.abs(b.infiltrated - b.rain) < 1e-6 * b.rain);
  assert.equal(b.outflow, 0);
});

test('isolated retention upstream lowers the downstream peak under simple conditions (tilted plane)', () => {
  const region = plane(32, 0.02);
  const p = { ...P(), stormIntensity_mm_h: 70, stormDuration_h: 2, simHours: 6, inflow_m3_s: 2, retentionCapacity_m3: 600000, interventionX: 0.5, interventionY: 0.6, interventionRadius_cells: 6 };
  const base = createSim(region, p, false);
  const alt = createSim(region, p, true);
  base.runToEnd();
  alt.runToEnd();
  assert.ok(alt.state.peakQ < base.state.peakQ, `${alt.state.peakQ} !< ${base.state.peakQ}`);
  assert.ok(alt.state.assets[0].maxDepth <= base.state.assets[0].maxDepth);
});

test('negative case: a basin on the ridge, off the flow path, leaves the hotel flood unchanged (< 1 cm, < 0.1 h)', () => {
  const p = { ...P(), interventionX: 0.06, interventionY: 0.5, interventionRadius_cells: 3 };
  const { summary } = runPair(20261125, p, 96);
  assert.ok(Math.abs(summary.intervention.hotelPeak_m - summary.baseline.hotelPeak_m) < 0.01);
  assert.ok(Math.abs(summary.intervention.hotelHoursAbove - summary.baseline.hotelHoursAbove) < 0.1);
  assert.ok(summary.intervention.stored_m3 < 1, 'a ridge basin fills with almost nothing');
});

test('same seed gives identical runs; a different seed gives a different region', () => {
  const a = runPair(42, P(), 48).summary;
  const b = runPair(42, P(), 48).summary;
  assert.deepEqual(a, b);
  const c = runPair(43, P(), 48).summary;
  assert.notDeepEqual(a.baseline.peakQ_m3_s, c.baseline.peakQ_m3_s);
});

test('the default scenario floods the hotel and the default wetland shortens it (demo sanity, 96² grid)', () => {
  const { summary } = runPair(20261125, P(), 96);
  assert.equal(summary.baseline.failed, null);
  assert.ok(summary.baseline.hotelHoursAbove > 0.5, String(summary.baseline.hotelHoursAbove));
  assert.ok(summary.intervention.hotelHoursAbove < summary.baseline.hotelHoursAbove);
  assert.ok(summary.baseline.maxCourant < 0.9);
});

test('pause and seek reproduce state: a fresh run to step k matches the stored snapshot exactly', () => {
  const region = makeRegion(9, 48);
  const p = P();
  const a = createSim(region, p, true);
  a.step(540); // 1.5 h at 10 s; snapshot every 90 steps
  const snap = a.snaps[a.snaps.length - 1];
  const b = createSim(region, p, true);
  b.step(Math.round(snap.t / p.timestep_s));
  for (let i = 0; i < b.h.length; i++) assert.equal(Math.fround(b.h[i]), snap.h[i]);
});

test('a timestep that is too large halts the run and says why', () => {
  const sim = createSim(makeRegion(4, 64), { ...P(), stormIntensity_mm_h: 140, inflow_m3_s: 40, timestep_s: 60 }, false);
  // At 60 s even critical flow √(g·h) crosses a 100 m cell in under a step once water is ~3 m deep.
  sim.runToEnd();
  assert.ok(sim.state.failed && /Courant/.test(sim.state.failed), String(sim.state.failed));
});

test('smaller timestep converges: peak outflow at dt=5 s and dt=10 s within 5%', () => {
  const region = makeRegion(11, 48);
  const p = { ...P(), simHours: 8 };
  const a = createSim(region, { ...p, timestep_s: 10 }, false, { snapshots: false });
  const b = createSim(region, { ...p, timestep_s: 5 }, false, { snapshots: false });
  a.runToEnd();
  b.runToEnd();
  const rel = Math.abs(a.state.peakQ - b.state.peakQ) / b.state.peakQ;
  assert.ok(rel < 0.05, `relative difference ${rel}`);
});

test('invalid inputs are refused with a message', () => {
  assert.throws(() => createSim(makeRegion(1, 32), { ...P(), stormIntensity_mm_h: -1 }, false), /between/);
  assert.throws(() => makeRegion(1, 500), /Grid/);
});

test('hazard curve: hotel peak depth rises with storm size in both arms', () => {
  const rows = hazardCurve(20261125, { ...P(), simHours: 10 }, 48);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].baseline.hotelPeak_m >= rows[i - 1].baseline.hotelPeak_m - 1e-9);
    assert.ok(rows[i].intervention.hotelPeak_m >= rows[i - 1].intervention.hotelPeak_m - 1e-9);
  }
});
