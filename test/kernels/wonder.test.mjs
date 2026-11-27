// Route jobs for the over-the-shoulder page: they must reproduce E02 exactly, arm by arm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPair, hazardCurve, CURVE_MULTIPLIERS } from '../../src/kernels/e02.js';
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
