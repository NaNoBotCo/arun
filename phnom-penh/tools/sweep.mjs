import { readFileSync } from 'node:fs';
import { PROPOSED, snapToRoads } from '../src/kernels/sensors.js';
import { runScenario } from '../src/kernels/scenario.js';
const geo = JSON.parse(readFileSync(new URL('../data/geo.json', import.meta.url)));
const sensors = snapToRoads(PROPOSED, geo);
const facility = { x: -1500, y: -600 };
const rows = [];
const T = performance.now();
for (let seed = 1; seed <= 24; seed++) {
  const t0 = performance.now();
  const r = runScenario({ seed, sensors, facility });
  rows.push([seed, r.storm.headingDeg.toFixed(0), r.storm.speedKmh.toFixed(1), r.tHeavy, r.tWater, r.peakCm.toFixed(0), r.network.tWarn, r.alone.tWarn, r.network.prep, r.alone.prep, r.gain, (performance.now() - t0).toFixed(0) + 'ms'].join('\t'));
}
console.log('seed\thead\tkmh\ttHeavy\ttWater\tpeakcm\tnetWarn\taloneWarn\tnetPrep\talonePrep\tgain\ttime');
console.log(rows.join('\n'));
console.log('total', (performance.now() - T).toFixed(0), 'ms');
