// The cached world the page opens on: junction sites and, for each, the rain warning the existing
// nowcast kernel issues from the simulated network (junction cameras plus the proposed gauges).
// Made at build time (tools/build-touch.mjs); test/kernels/touch-sim.test.mjs remakes it and compares.
import { buildGraph } from '../kernels/route.js';
import { PROPOSED, snapToRoads } from '../kernels/sensors.js';
import { observe, fitMotion, members, heavyChance, KERNEL_VERSION } from '../kernels/nowcast.js';
import { ADAPTER_VERSION } from '../kernels/observe.js';
import { pickJunctions, rainFacts, storm, STORM_SEED, SIM_VERSION } from './sim.js';

// nowcast.js warning() for many points at once, without a roof gauge: the motion fit and its ensemble
// do not depend on the point, so they are made once per minute; each point stops once it is warned.
// Same rule: the first minute the chance of heavy rain within 90 minutes reaches p.
export function warnings(obs, points, { p = 0.5, seed = 1, t1 = 180 } = {}) {
  const tWarn = points.map(() => -1);
  let lastSig = '', mems = null;
  for (let t = 0; t <= t1; t++) {
    if (tWarn.every(v => v >= 0)) break;
    const fit = fitMotion(obs, t);
    if (!fit) continue;
    const sig = fit.n + ':' + fit.sx.toFixed(8) + ':' + fit.sy.toFixed(8);
    if (sig !== lastSig) { mems = members(fit, seed); lastSig = sig; }
    points.forEach((q, i) => { if (tWarn[i] < 0 && heavyChance(obs, t, mems, q.x, q.y).p >= p) tWarn[i] = t; });
  }
  return tWarn;
}

export function makeFixture(geo, graph = buildGraph(geo)) {
  const junctions = pickJunctions(graph);
  const gauges = snapToRoads(PROPOSED.filter(s => s.kind === 'gauge'), geo).map(({ id, kind, ring, x, y }) => ({ id, kind, ring, x: Math.round(x), y: Math.round(y) }));
  const cams = junctions.map(j => ({ id: 'c' + j.id.slice(2), kind: 'camera', x: j.x, y: j.y }));
  const obs = observe(storm, [...cams, ...gauges], STORM_SEED);
  const tw = warnings(obs, junctions, { seed: STORM_SEED });
  const out = junctions.map((j, i) => ({ ...j, tWarn: tw[i], ...rainFacts(j) }));
  return {
    version: { sim: SIM_VERSION, nowcast: KERNEL_VERSION, observe: ADAPTER_VERSION, storm: STORM_SEED },
    note: 'Simulated network: junction cameras and gauges are illustrative sites, not real equipment.',
    junctions: out, gauges,
  };
}
