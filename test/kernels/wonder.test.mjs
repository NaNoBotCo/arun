// Route jobs for the over-the-shoulder page: they must reproduce E02 exactly, arm by arm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPair, hazardCurve, CURVE_MULTIPLIERS, makeRegion, createSim, METHOD_VERSION } from '../../src/kernels/e02.js';
import { loadMap, indexOf, positionOf, mapApplies, PMAP_SIDE } from '../../src/wonder/pmap.js';
import { defaultScenario } from '../../src/core/scenario.js';
import { baselineParams, runArm, sweepJobs, rowsFromArms, streamRun } from '../../src/wonder/flow.js';

const S = defaultScenario();
const N = 48; // smaller grid keeps the test quick; the identity holds at any size
const P = { ...S.hydro, grid: N };

test('one arm at a time equals E02 runPair (exact)', () => {
  const pair = runPair(S.seed, P, N).summary;
  assert.deepEqual(runArm(S.seed, P, N, 'baseline'), pair.baseline);
  assert.deepEqual(runArm(S.seed, P, N, 'intervention'), pair.intervention);
});

test('baseline arm ignores the wetland, so one cached run serves every placement (exact)', () => {
  const moved = { ...P, interventionX: 0.2, interventionY: 0.8, interventionRadius_cells: 3, retentionCapacity_m3: 50000 };
  assert.deepEqual(baselineParams(P), baselineParams(moved));
  assert.deepEqual(runArm(S.seed, baselineParams(moved), N, 'baseline'), runPair(S.seed, moved, N).summary.baseline);
});

test('sweep from separate arm jobs equals E02 hazardCurve (exact)', () => {
  const jobs = sweepJobs(S.seed, P, N);
  assert.equal(jobs.length, CURVE_MULTIPLIERS.length * 2);
  const byKey = {};
  for (const j of jobs) byKey[j.m + ':' + j.arm] = runArm(j.payload.seed, j.payload.params, j.payload.N, j.payload.arm);
  assert.deepEqual(rowsFromArms(P, byKey), hazardCurve(S.seed, P, N));
});

test('stream sends one frame per 15 simulated minutes and ends with the same summaries', () => {
  const frames = [];
  let lastP = 0;
  const r = streamRun({ seed: S.seed, params: P, N }, { emit: (f) => frames.push(f), progress: (p) => (lastP = p) });
  const steps = Math.ceil((P.simHours * 3600) / P.timestep_s);
  assert.equal(r.steps, steps);
  assert.equal(frames.length, Math.ceil(steps / Math.round(900 / P.timestep_s)) + 1);
  assert.equal(frames[0].t, 0);
  assert.equal(frames.at(-1).t, P.simHours * 3600);
  assert.equal(frames[5].arms.baseline.h.length, N * N);
  assert.equal(lastP, 1);
  const pair = runPair(S.seed, P, N).summary;
  assert.deepEqual(r.summaries.baseline, pair.baseline);
  assert.deepEqual(r.summaries.intervention, pair.intervention);
});

test('stream of the wetland arm alone matches the paired run (exact)', () => {
  const r = streamRun({ seed: S.seed, params: P, N, arms: ['intervention'] });
  assert.deepEqual(r.summaries.intervention, runPair(S.seed, P, N).summary.intervention);
  assert.equal(r.summaries.baseline, undefined);
});

test('water budget closes in every arm of the stream (residual within 0.1% of input)', () => {
  const r = streamRun({ seed: S.seed, params: P, N });
  for (const arm of ['baseline', 'intervention']) {
    const s = r.summaries[arm];
    assert.ok(Math.abs(s.residual_m3) <= Math.max(1e-6, 0.001 * s.input_m3), `${arm} residual ${s.residual_m3}`);
  }
});

// The precomputed protection map must be what the kernel gives today, spot for spot.

test('protection map was made with today’s defaults (seed, storm, wetland size, model version)', () => {
  const M = loadMap();
  assert.equal(M.hotelSeconds.length, PMAP_SIDE * PMAP_SIDE);
  assert.ok(mapApplies(S.seed, S.hydro));
  assert.ok(!mapApplies(S.seed, { ...S.hydro, stormIntensity_mm_h: 50 }));
  assert.equal(M.meta.method, METHOD_VERSION);
});

test('protection map: five spots recomputed now equal the map exactly (hotel seconds; peak flow to 0.1 m³/s)', () => {
  const M = loadMap();
  const region = makeRegion(S.seed, S.hydro.grid);
  const spots = [[0.59, 0.44], [0.3, 0.7], [0.55, 0.85], positionOf(M.best.hotel), positionOf(M.best.river)].map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p));
  for (const { x, y } of spots) {
    const sim = createSim(region, { ...S.hydro, interventionX: x, interventionY: y }, true, { snapshots: false });
    sim.runToEnd();
    const i = indexOf(x, y);
    assert.equal(sim.state.assets[0].secondsAbove, M.hotelSeconds[i], `hotel at ${x},${y}`);
    assert.equal(Math.round(sim.state.peakQ * 10) / 10, M.peakQ[i], `peak flow at ${x},${y}`);
  }
  const base = createSim(region, S.hydro, false, { snapshots: false });
  base.runToEnd();
  assert.equal(base.state.assets[0].secondsAbove, M.meta.baseHotelSeconds);
});

// The side view draws water as a liquid: level against dry banks, exact at every wet cell, never above its own surface.
import { sectionWater, groundAt } from '../../src/wonder/section.js';

test('side view: water left in the channel lies level and stops where it meets each bank (the 27 Nov screenshot case)', () => {
  // End of the storm, the hotel's row: only the channel cell is wet.
  const z = [47.86, 47.56, 45.34, 43.21, 42.45, 45.18, 46.68, 47.57];
  const h = [0, 0, 0, 0, 0.75, 0, 0, 0];
  const { runs, flows } = sectionWater(z, h);
  assert.equal(runs.length, 1);
  const L = 42.45 + 0.75;
  for (const p of runs[0]) assert.ok(Math.abs(p.top - L) < 1e-12, `surface ${p.top} at x ${p.x} is level at ${L}`);
  // It meets the ground at both ends, inside the cells next to the channel.
  const [a, b] = [runs[0][0], runs[0][runs[0].length - 1]];
  assert.ok(Math.abs(groundAt(z, a.x) - L) < 1e-9 && a.x > 3 && a.x < 4);
  assert.ok(Math.abs(groundAt(z, b.x) - L) < 1e-9 && b.x > 4 && b.x < 5);
  assert.equal(flows.length, 0);
});

test('side view at the storm\'s peak: the channel pool is level; the sheet on each slope keeps the model\'s z + h, the hotel exactly; water runs down to the pool', () => {
  // The hotel's row at the deepest moment without the wetland; the hotel is cell 10.
  const z = [47.86, 47.56, 47.23, 46.69, 46.12, 45.74, 45.34, 43.21, 42.45, 45.18, 46.68, 47.57, 48.38, 49.09, 49.79, 50.83];
  const h = [0.08, 0.06, 0.05, 0.05, 0.05, 0.05, 0.05, 1.05, 2.52, 0.66, 0.47, 0.48, 0.46, 0.31, 0.2, 0.07];
  const { runs, flows, pools } = sectionWater(z, h);
  assert.equal(runs.length, 1);
  const P = 42.45 + 2.52;
  assert.equal(pools[0].level, P);
  const r = runs[0];
  for (const p of r) {
    assert.ok(p.top >= groundAt(z, p.x) - 1e-9, 'never under the ground');
    if (Number.isInteger(p.x) && z[p.x] >= P) assert.equal(p.top, z[p.x] + h[p.x], `sheet cell ${p.x} exact`);
    if (Number.isInteger(p.x) && z[p.x] < P) assert.equal(p.top, P, `pool cell ${p.x} level`);
  }
  assert.equal(r.find((p) => p.x === 10).top, 46.68 + 0.47, 'the hotel shows the model\'s depth');
  // No dip anywhere: the surface falls toward the pool from the west and rises away from it to the east.
  const lo = r.findIndex((p) => p.top === P);
  for (let i = 1; i <= lo; i++) assert.ok(r[i].top <= r[i - 1].top + 1e-12);
  for (let i = lo + 1; i < r.length; i++) assert.ok(r[i].top >= r[i - 1].top - 1e-12);
  // Sheet water runs toward the pool on both slopes.
  assert.ok(flows.some((f) => f.x0 >= 9 && f.down === -1) && flows.some((f) => f.x1 <= 7 && f.down === 1));
  assert.ok(flows.every((f) => (f.x1 <= 7.5 ? f.down === 1 : f.down === -1)));
});

test('side view: a dry section has no water; a film thinner than 2 cm is drawn dry', () => {
  assert.deepEqual(sectionWater([3, 2, 1, 2, 3], [0, 0, 0, 0, 0]).runs, []);
  assert.deepEqual(sectionWater([3, 2, 1, 2, 3], [0.01, 0.01, 0.015, 0.01, 0]).runs, []);
  assert.throws(() => sectionWater([1, 2], [0]), /same number/);
});

test('side view: water on an open slope is a sheet with its own depths, not a level pool', () => {
  // Ground falls to the east and the section ends: no bank holds the water, so nothing is levelled.
  const z = [10, 9, 8, 7, 6];
  const h = [0.3, 0.2, 0.1, 0, 0];
  const { runs, flows, pools } = sectionWater(z, h);
  assert.equal(pools.length, 0);
  for (const p of runs[0]) if (Number.isInteger(p.x) && h[p.x] > 0.02) assert.equal(p.top, z[p.x] + h[p.x]);
  assert.ok(flows.length > 0 && flows.every((f) => f.down === 1));
});

test('side view: still water in a basin of several cells is level across them', () => {
  const z = [5, 3, 2, 2.5, 3, 5];
  const h = [0, 0.8, 1.8, 1.3, 0.8, 0];
  const { runs, flows } = sectionWater(z, h);
  assert.equal(runs.length, 1);
  for (const p of runs[0]) assert.ok(Math.abs(p.top - 3.8) < 1e-12);
  assert.equal(flows.length, 0);
});
