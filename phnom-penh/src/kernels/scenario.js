// One scenario, one timeline, in four separate parts:
//   truth      the illustrative storm, rain at the door, water depth (the simulation; never read by the forecast)
//   obs        what the sensors report (observation adapter)
//   inference  the warning with the network and with the roof gauge alone, from obs only
//   evaluation the inference scored against the truth: lead minutes and the outcome class
// Every number on screen comes from here.
import { makeStorm, series } from './storm.js';
import { warning, HEAVY } from './nowcast.js';
import { observe, validateObsOptions } from './observe.js';
import { streetDepth, firstAtOrAbove, HYDRO } from './hydro.js';
import { KINDS } from './sensors.js';

const fin = x => typeof x === 'number' && Number.isFinite(x);
export function validateConfig(cfg) {
  const e = [];
  if (!cfg || typeof cfg !== 'object') throw new Error('scenario: no config');
  const { seed = 7, sensors, facility, hydro = HYDRO, extra = {}, warnP = 0.5 } = cfg;
  if (!Number.isInteger(seed) || seed < 1 || seed > 1e6) e.push('seed');
  if (!Array.isArray(sensors) || sensors.length > 400) e.push('sensors');
  else for (const s of sensors) if (!s || typeof s.id !== 'string' || !KINDS[s.kind] || !fin(s.x) || !fin(s.y) || Math.abs(s.x) > 60000 || Math.abs(s.y) > 60000) { e.push('sensor ' + (s && s.id)); break; }
  if (!facility || !fin(facility.x) || !fin(facility.y) || Math.abs(facility.x) > 60000 || Math.abs(facility.y) > 60000) e.push('facility');
  for (const k of Object.keys(HYDRO)) if (!fin(hydro[k]) || hydro[k] <= 0) e.push('hydro.' + k);
  if (extra.pumpM3min != null && (!fin(extra.pumpM3min) || extra.pumpM3min < 0)) e.push('pump');
  if (extra.tankM3 != null && (!fin(extra.tankM3) || extra.tankM3 < 0)) e.push('tank');
  if (!fin(warnP) || warnP <= 0 || warnP > 1) e.push('warnP');
  if (e.length) throw new Error('scenario: bad ' + e.join(', '));
  return { ...cfg, seed, hydro, extra, warnP, obsOpts: validateObsOptions(cfg.obsOpts) };
}

// outcome classes: hit (notice before water) · late (notice at or after water) · miss (water, no notice)
// · false (notice, no water) · quiet (no water, no notice)
export const outcome = (tWater, tWarn) => tWater < 0 ? (tWarn >= 0 ? 'false' : 'quiet') : tWarn < 0 ? 'miss' : tWarn < tWater ? 'hit' : 'late';

export function truthFor(storm, facility, hydro = HYDRO, extra = {}) {
  const rainAtDoor = series(storm, facility.x, facility.y);
  const depth = streetDepth(rainAtDoor, hydro, extra);
  const tHeavy = firstAtOrAbove(rainAtDoor, HEAVY);
  const tWater = firstAtOrAbove(depth, hydro.kerbCm);
  let peak = 0, tPeak = 0; for (let t = 0; t < depth.length; t++) if (depth[t] > peak) { peak = depth[t]; tPeak = t; }
  return { rainAtDoor, depth, tHeavy, tWater, peakCm: peak, tPeak };
}

export function runScenario(cfg0) {
  const cfg = validateConfig(cfg0);
  const { seed, sensors, facility, hydro, extra, warnP, obsOpts } = cfg;
  const storm = cfg.storm || makeStorm(seed);
  const truth = truthFor(storm, facility, hydro, extra);

  const roof = { id: 'roof', kind: 'roof', x: facility.x, y: facility.y };
  const obsAll = observe(storm, [...sensors, roof], seed, obsOpts);
  const obsAlone = obsAll.filter(o => o.kind === 'roof');
  const net = warning(obsAll, facility, { p: warnP, seed });
  const alone = warning(obsAlone, facility, { p: warnP, seed });

  const lead = (tw) => (truth.tWater >= 0 && tw >= 0 ? truth.tWater - tw : null);
  const evaluation = {
    network: { prep: lead(net.tWarn), outcome: outcome(truth.tWater, net.tWarn) },
    alone: { prep: lead(alone.tWarn), outcome: outcome(truth.tWater, alone.tWarn) },
  };
  evaluation.gain = evaluation.network.prep != null && evaluation.alone.prep != null ? evaluation.network.prep - evaluation.alone.prep : null;
  return {
    seed, storm, truth, obs: obsAll, inference: { network: net, alone }, evaluation,
    // flat fields used by the sheet
    rainAtDoor: truth.rainAtDoor, depth: truth.depth, tHeavy: truth.tHeavy, tWater: truth.tWater, peakCm: truth.peakCm, tPeak: truth.tPeak,
    network: { tWarn: net.tWarn, chance: net.chance, cover: net.cover, state: net.state, firstFit: net.firstFit, fit: net.fitAtWarn, prep: evaluation.network.prep, outcome: evaluation.network.outcome },
    alone: { tWarn: alone.tWarn, chance: alone.chance, cover: alone.cover, state: alone.state, prep: evaluation.alone.prep, outcome: evaluation.alone.outcome },
    gain: evaluation.gain,
    falseAlarm: truth.tWater < 0 && net.tWarn >= 0,
  };
}
