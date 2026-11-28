// Over-the-shoulder route: background jobs that reuse the E02 flood kernel without changing it.
// One arm per job, so the storm-size sweep spreads over several workers, and the baseline arm
// (which never reads the wetland settings) is cached across wetland moves.
// Pure: runs in node, a Worker or the page.

import { makeRegion, createSim, CURVE_MULTIPLIERS } from '../kernels/e02.js';

export const FLOW_VERSION = 'wonder-flow-1.0.0';

// The baseline arm ignores every wetland field; fixing them makes its job key the same for any wetland.
export function baselineParams(p) {
  return { ...p, interventionX: 0, interventionY: 0, interventionRadius_cells: 1, retentionCapacity_m3: 0 };
}

// The same fields E02's summarise() reports for one arm.
export function armSummary(sim) {
  const st = sim.state;
  const b = sim.budget();
  return {
    failed: st.failed,
    hotelPeak_m: st.assets[0].maxDepth,
    hotelHoursAbove: st.assets[0].secondsAbove / 3600,
    assets: st.assets.map((a) => ({ id: a.id, peak_m: a.maxDepth, hoursAbove: a.secondsAbove / 3600, threshold_m: a.threshold_m })),
    peakQ_m3_s: st.peakQ,
    peakQ_h: st.peakQ_t / 3600,
    stored_m3: b.stored,
    infiltrated_m3: b.infiltrated,
    outflow_m3: b.outflow,
    input_m3: b.input,
    residual_m3: b.residual,
    maxCourant: st.maxCourant,
  };
}

function armParams(p, arm) {
  return arm === 'baseline' ? baselineParams(p) : p;
}

// One arm to the end, no snapshots.
export function runArm(seed, p, N, arm) {
  const region = makeRegion(seed, N);
  const sim = createSim(region, armParams(p, arm), arm === 'intervention', { snapshots: false });
  sim.runToEnd();
  return armSummary(sim);
}

// Storm sizes exactly as E02's hazardCurve() makes them.
export function sweepParams(p, m) {
  const q = { ...p, forcingMultiplier: Math.min(2, Math.max(0.5, p.forcingMultiplier)) };
  q.stormIntensity_mm_h = Math.min(150, p.stormIntensity_mm_h * m);
  return q;
}

// The list of arm jobs for one sweep. Baseline jobs carry baseline params, so they repeat across wetland moves.
export function sweepJobs(seed, p, N) {
  const out = [];
  for (const m of CURVE_MULTIPLIERS) {
    const q = sweepParams(p, m);
    out.push({ m, arm: 'baseline', payload: { seed, params: baselineParams(q), N, arm: 'baseline' } });
    out.push({ m, arm: 'intervention', payload: { seed, params: q, N, arm: 'intervention' } });
  }
  return out;
}

// Rows in the shape hazardCurve() returns, from arm results keyed `${m}:${arm}`.
export function rowsFromArms(p, byKey) {
  return CURVE_MULTIPLIERS.map((m) => {
    const q = sweepParams(p, m);
    return { multiplier: m, stormIntensity_mm_h: q.stormIntensity_mm_h, baseline: byKey[m + ':baseline'], intervention: byKey[m + ':intervention'] };
  });
}

// Both arms (or one) stepped together; a frame of water depths every 15 simulated minutes goes out through emit().
export function streamRun({ seed, params, N, arms = ['baseline', 'intervention'] }, { progress = () => {}, emit = () => {} } = {}) {
  const region = makeRegion(seed, N);
  const sims = arms.map((arm) => ({ arm, sim: createSim(region, armParams(params, arm), arm === 'intervention', { snapshots: false }) }));
  const per = Math.max(1, Math.round(900 / params.timestep_s));
  const total = sims[0].sim.totalSteps;
  const frame = () => {
    const f = { t: sims[0].sim.state.t, arms: {} };
    for (const { arm, sim } of sims) {
      f.arms[arm] = { h: Float32Array.from(sim.h), assets: sim.state.assets.map((a) => a.depth), q: sim.state.lastQ, stored: sim.basin.stored };
    }
    return f;
  };
  emit(frame());
  while (!sims.every(({ sim }) => sim.done)) {
    for (const { sim } of sims) sim.step(per);
    emit(frame());
    progress(sims[0].sim.state.step / total);
  }
  const summaries = {};
  for (const { arm, sim } of sims) summaries[arm] = armSummary(sim);
  return { summaries, steps: sims[0].sim.state.step };
}

export const jobs = {
  'wonder.arm': ({ seed, params, N, arm }) => runArm(seed, params, N, arm),
  'wonder.stream': (payload, ctx) => streamRun(payload, ctx),
};
