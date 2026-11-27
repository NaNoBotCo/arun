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
